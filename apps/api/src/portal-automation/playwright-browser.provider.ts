/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type ConsoleMessage, type Page, type Request, type Response } from 'playwright';
import {
  type BrowserProvider,
  type ActionLocatorDescriptor,
  type ActionLocatorResult,
  type BrowserSession,
  type BrowserSessionOptions,
  type FormLocatorDescriptor,
  type FieldInteractionDescriptor,
  type NavigationResult,
  type HttpResponseMatcher,
  type ObservedHttpResponse,
  type PageMetadata,
  type StageTransitionDescriptor,
  type StageTransitionEvidence,
  type VisibleElements,
  type ObservePortalActionInput,
  type PortalActionObservation,
  type PortalActionSnapshot,
  type PortalFieldState,
  type PortalNetworkActivity,
  isAllowedPortalUrl,
} from './browser-provider';

type ActiveSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  options: BrowserSessionOptions;
  observedDomains: Set<string>;
  blockedDomains: Set<string>;
  blockedNavigation?: string;
  pendingResponses: Set<Promise<ObservedHttpResponse>>;
};

@Injectable()
export class PlaywrightBrowserProvider implements BrowserProvider {
  private readonly sessions = new Map<string, ActiveSession>();

  constructor(private readonly config: ConfigService) {}

  async createSession(options: BrowserSessionOptions): Promise<BrowserSession> {
    const executablePath = this.config.get<string>('PAE_BROWSER_EXECUTABLE_PATH') || undefined;
    const browser = await tracePlaywright('chromium.launch', undefined, options.timeoutMs, () => chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) }));
    const context = await tracePlaywright('browser.newContext', undefined, options.timeoutMs, () => browser.newContext({
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
      serviceWorkers: 'block',
    }));
    const page = await tracePlaywright('context.newPage', undefined, options.timeoutMs, () => context.newPage());
    page.setDefaultTimeout(options.timeoutMs);
    page.setDefaultNavigationTimeout(options.timeoutMs);

    const observedDomains = new Set<string>();
    const blockedDomains = new Set<string>();
    const active: ActiveSession = { browser, context, page, options, observedDomains, blockedDomains, pendingResponses: new Set() };
    await tracePlaywright('context.route', '**/*', options.timeoutMs, () => context.route('**/*', async (route) => {
      const request = route.request();
      const requestUrl = request.url();
      if (requestUrl.startsWith('data:') || requestUrl.startsWith('blob:')) {
        await route.continue();
        return;
      }
      try {
        observedDomains.add(new URL(requestUrl).hostname.toLowerCase());
      } catch {
        await route.abort('blockedbyclient');
        return;
      }
      if (!isAllowedPortalUrl(requestUrl, options.allowedDomains)) {
        blockedDomains.add(new URL(requestUrl).hostname.toLowerCase());
        if (request.isNavigationRequest()) active.blockedNavigation = requestUrl;
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    }));

    const id = randomUUID();
    this.sessions.set(id, active);
    return { id };
  }

  async closeSession(session: BrowserSession): Promise<void> {
    const active = this.sessions.get(session.id);
    if (!active) return;
    await Promise.allSettled([...active.pendingResponses]);
    this.sessions.delete(session.id);
    await active.context.close().catch(() => undefined);
    await active.browser.close().catch(() => undefined);
  }

  async navigate(session: BrowserSession, url: string): Promise<NavigationResult> {
    const active = this.getSession(session);
    if (!isAllowedPortalUrl(url, active.options.allowedDomains)) {
      throw new PortalNavigationError('DOMAIN_BLOCKED', 'Navigation target is not approved');
    }
    delete active.blockedNavigation;
    try {
      await tracePlaywright('page.goto', url, active.options.timeoutMs, () => active.page.goto(url, { waitUntil: 'domcontentloaded', timeout: active.options.timeoutMs }));
      await tracePlaywright('page.waitForTimeout', undefined, 250, () => active.page.waitForTimeout(250));
    } catch (error) {
      if (active.blockedNavigation) {
        throw new PortalNavigationError('REDIRECT_BLOCKED', 'Portal redirected to a non-approved domain');
      }
      throw error;
    }
    const finalUrl = active.page.url();
    if (!isAllowedPortalUrl(finalUrl, active.options.allowedDomains)) {
      throw new PortalNavigationError('REDIRECT_BLOCKED', 'Portal ended on a non-approved domain');
    }
    return {
      finalUrl,
      observedDomains: [...active.observedDomains].sort(),
      blockedDomains: [...active.blockedDomains].sort(),
    };
  }

  async waitForPortalReady(session: BrowserSession, selector: string, timeoutMs: number): Promise<void> {
    const page = this.getSession(session).page;
    await tracePlaywright('locator.waitFor', selector, timeoutMs, () =>
      page.locator(selector).waitFor({ state: 'visible', timeout: timeoutMs }));
  }

  async getPageMetadata(session: BrowserSession): Promise<PageMetadata> {
    const page = this.getSession(session).page;
    return { title: await page.title(), url: page.url() };
  }

  async captureScreenshot(session: BrowserSession, reference: string): Promise<string> {
    const configured = this.config.get<string>('PAE_SCREENSHOT_DIR') ?? '.pae-artifacts';
    const directory = resolve(process.cwd(), configured);
    await mkdir(directory, { recursive: true });
    const fileName = `${reference.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    const path = resolve(directory, fileName);
    await this.getSession(session).page.screenshot({ path, fullPage: true });
    return path;
  }

  async extractVisibleElements(session: BrowserSession): Promise<VisibleElements> {
    const page = this.getSession(session).page;
    const fields = await page.locator('input, select, textarea').evaluateAll((elements: any[]) =>
      elements
        .filter((element) => {
          const style = (globalThis as any).getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
        })
        .map((element) => {
          const html = element;
          const id = html.id;
          const explicitLabel = id ? element.ownerDocument.querySelector(`label[for="${(globalThis as any).CSS.escape(id)}"]`)?.textContent : undefined;
          const wrappingLabel = element.closest('label')?.textContent;
          return {
            tag: element.tagName.toLowerCase(),
            type: html.type || undefined,
            name: html.name || undefined,
            label: (html.getAttribute('aria-label') || explicitLabel || wrappingLabel || '').trim() || undefined,
            placeholder: html.getAttribute('placeholder')?.trim() || undefined,
          };
        }),
    ) as Array<{ tag: 'input' | 'select' | 'textarea'; type?: string; name?: string; label?: string; placeholder?: string }>;
    const buttons = await page.locator('button, input[type="button"], input[type="submit"], [role="button"]').evaluateAll((elements: any[]) =>
      elements
        .filter((element) => {
          const style = (globalThis as any).getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
        })
        .map((element) => (element.value || element.textContent || element.getAttribute('aria-label') || '').trim())
        .filter(Boolean),
    );
    const bodyText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const headings = await this.visibleTexts(page, 'h1, h2, h3, h4, legend');
    const statusMessages = await this.visibleTexts(page, '[role="alert"], .alert, [class*="error" i], [id*="error" i]');
    const captchaDetected = await page.locator('iframe[src*="captcha" i], [class*="captcha" i], [id*="captcha" i], [data-sitekey]').count().then((count) => count > 0) || /captcha|c[oó]digo de seguridad/i.test(bodyText);
    const loginDetected = await page.locator('input[type="password"]').count().then((count) => count > 0) || /iniciar sesi[oó]n|acceder a tu cuenta/i.test(bodyText);
    const legalMessages = bodyText
      .split(/(?<=[.!?])\s+/)
      .filter((text) => /aviso de privacidad|t[eé]rminos|restricci[oó]n|factur/i.test(text))
      .slice(0, 10)
      .map((text) => text.slice(0, 300));
    return { fields, buttons: [...new Set(buttons)], headings, statusMessages, captchaDetected, loginDetected, legalMessages };
  }

  async fillField(session: BrowserSession, name: string, value: string): Promise<void> {
    await this.interactWithField(session, {
      name,
      control: 'text',
      expectedVisibleCount: 1,
    }, value);
  }

  async interactWithField(
    session: BrowserSession,
    descriptor: FieldInteractionDescriptor,
    value: string,
  ): Promise<void> {
    const active = this.getSession(session);
    const selector = fieldDescriptorLabel(descriptor);
    const candidates = resolveFieldLocator(active.page, descriptor);
    const totalCount = await tracePlaywright('locator.count', selector, 0, () => candidates.count());
    const visibleIndexes: number[] = [];
    for (let index = 0; index < totalCount; index += 1) {
      if (await tracePlaywright('locator.isVisible', selector, 0, () => candidates.nth(index).isVisible())) {
        visibleIndexes.push(index);
      }
    }
    if (visibleIndexes.length !== descriptor.expectedVisibleCount || visibleIndexes.length !== 1) {
      throw new FieldLocatorAmbiguousError(descriptor, totalCount, visibleIndexes.length);
    }
    const field = candidates.nth(visibleIndexes[0]!);
    if (descriptor.control === 'select') {
      await tracePlaywright('locator.selectOption', selector, active.options.timeoutMs, () => field.selectOption(value));
    } else if (descriptor.inputMethod === 'press-sequentially') {
      await tracePlaywright('locator.focus', selector, active.options.timeoutMs, () => field.focus());
      await tracePlaywright('locator.pressSequentially', selector, active.options.timeoutMs, () => field.pressSequentially(value, { delay: 15 }));
    } else {
      await tracePlaywright('locator.fill', selector, active.options.timeoutMs, () => field.fill(value));
    }
    for (const event of descriptor.events ?? []) {
      if (event === 'blur') {
        await tracePlaywright('locator.blur', selector, active.options.timeoutMs, () => field.blur());
      } else {
        await tracePlaywright('locator.dispatchEvent', `${selector}:${event}`, active.options.timeoutMs, () => field.dispatchEvent(event));
      }
    }
  }

  async clickAction(
    session: BrowserSession,
    formDescriptor: FormLocatorDescriptor,
    descriptor: ActionLocatorDescriptor,
  ): Promise<ActionLocatorResult> {
    const page = this.getSession(session).page;
    const anchorSelector = formDescriptor.anchorInputSelector ?? formDescriptor.anchorLabel ?? '';
    const anchors = formDescriptor.anchorInputSelector
      ? page.locator(formDescriptor.anchorInputSelector)
      : page.getByLabel(formDescriptor.anchorLabel ?? '', { exact: true });
    const anchorTotalCount = await tracePlaywright(
      'locator.count', anchorSelector, 0, () => anchors.count(),
    );
    const visibleAnchorIndexes: number[] = [];
    for (let index = 0; index < anchorTotalCount; index += 1) {
      if (await tracePlaywright(
        'locator.isVisible', anchorSelector, 0, () => anchors.nth(index).isVisible(),
      )) visibleAnchorIndexes.push(index);
    }
    const anchorVisibleCount = visibleAnchorIndexes.length;
    if (anchorVisibleCount !== formDescriptor.expectedVisibleCount || anchorVisibleCount !== 1) {
      throw new FormOrActionAmbiguousError(formDescriptor, descriptor, {
        anchorTotalCount, anchorVisibleCount, formVisibleCount: 0, totalCount: 0, visibleCount: 0,
      });
    }

    const root = anchors.nth(visibleAnchorIndexes[0]!).locator(`xpath=ancestor::${formDescriptor.containerSelector}[1]`);
    const formVisibleCount = await tracePlaywright(
      'locator.count', formDescriptor.containerSelector, 0, () => root.count(),
    );
    const formIsVisible = formVisibleCount === 1 && await tracePlaywright(
      'locator.isVisible', formDescriptor.containerSelector, 0, () => root.isVisible(),
    );
    if (!formIsVisible) {
      throw new FormOrActionAmbiguousError(formDescriptor, descriptor, {
        anchorTotalCount, anchorVisibleCount, formVisibleCount: formIsVisible ? 1 : 0, totalCount: 0, visibleCount: 0,
      });
    }
    let candidates = descriptor.role
      ? root.getByRole(descriptor.role, descriptor.name ? { name: descriptor.name, exact: true } : {})
      : root.locator(descriptor.css ?? '*');
    if (descriptor.css && descriptor.role) candidates = candidates.and(root.locator(descriptor.css));
    const totalCount = await tracePlaywright('locator.count', descriptor.css ?? descriptor.role, 0, () => candidates.count());
    const visibleIndexes: number[] = [];
    for (let index = 0; index < totalCount; index += 1) {
      const candidate = candidates.nth(index);
      const visible = await tracePlaywright('locator.isVisible', descriptor.css ?? descriptor.role, 0, () => candidate.isVisible());
      const textMatches = descriptor.text === undefined || normalizeActionText(await tracePlaywright(
        'locator.textContent', descriptor.css ?? descriptor.role, 0, () => candidate.textContent(),
      )) === normalizeActionText(descriptor.text);
      if ((!descriptor.visibleOnly || visible) && textMatches) visibleIndexes.push(index);
    }
    const visibleCount = visibleIndexes.length;
    const resolution = {
      anchorTotalCount, anchorVisibleCount, formVisibleCount: 1,
      totalCount, visibleCount, containerSelector: formDescriptor.containerSelector,
    };
    writeActionResolution(formDescriptor, descriptor, resolution);
    assertFormAndActionResolution(formDescriptor, descriptor, resolution);
    await tracePlaywright('locator.click', descriptor.css ?? descriptor.role, this.getSession(session).options.timeoutMs, () =>
      candidates.nth(visibleIndexes[0]!).click({ noWaitAfter: true }));
    return resolution;
  }

  async observeAction(session: BrowserSession, input: ObservePortalActionInput): Promise<PortalActionObservation> {
    const active = this.getSession(session);
    const page = active.page;
    const startedAt = new Date();
    const networkErrors: string[] = [];
    const javascriptErrors: string[] = [];
    const consoleMessages: string[] = [];
    const networkActivity = new Map<Request, PortalNetworkActivity>();
    let expectedRequest: Request | undefined;
    let expectedResponse: Response | undefined;
    let requestStartedAt: number | undefined;
    let responseReceivedAt: number | undefined;

    const matchesExpected = (method: string, rawUrl: string) => input.expectedRequest
      ? method.toUpperCase() === input.expectedRequest.method.toUpperCase()
        && safePathname(rawUrl) === input.expectedRequest.pathname
      : false;
    const onRequest = (request: Request) => {
      if (['xhr', 'fetch', 'document'].includes(request.resourceType())) {
        networkActivity.set(request, {
          method: request.method(), url: sanitizeDiagnosticUrl(request.url()), resourceType: request.resourceType(),
          requestStructure: summarizeRequestStructure(request),
        });
      }
      if (matchesExpected(request.method(), request.url())) {
        expectedRequest = request;
        requestStartedAt = Date.now();
      }
    };
    const onResponse = (response: Response) => {
      const request = response.request();
      const activity = networkActivity.get(request);
      if (activity) {
        activity.status = response.status();
      }
      if (matchesExpected(request.method(), request.url())) {
        expectedResponse = response;
        responseReceivedAt = Date.now();
      }
    };
    const onRequestFailed = (request: Request) => {
      if (matchesExpected(request.method(), request.url())) {
        networkErrors.push(sanitizeDiagnosticText(request.failure()?.errorText ?? 'Request failed'));
      }
    };
    const onPageError = (error: Error) => javascriptErrors.push(sanitizeDiagnosticText(error.message));
    const onConsole = (message: ConsoleMessage) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        consoleMessages.push(sanitizeDiagnosticText(message.text()));
      }
    };

    page.on('request', onRequest);
    page.on('response', onResponse);
    page.on('requestfailed', onRequestFailed);
    page.on('pageerror', onPageError);
    page.on('console', onConsole);

    try {
      await installActionEventProbe(page, input.form, input.action);
      const before = await captureActionSnapshot(page, input);
      assertStageFieldsReady(before.currentStageFieldStates ?? []);
      const beforeScreenshot = await captureRedactedScreenshot(page);
      const actionResolution = await this.clickAction(session, input.form, input.action);
      const after = await captureActionSnapshot(page, input);
      const afterScreenshot = await captureRedactedScreenshot(page);
      const baselineMessages = new Set(before.statusMessages);
      const deadline = Date.now() + input.timeoutMs;
      let transitionEvidence: StageTransitionEvidence | undefined;
      let outcome: PortalActionObservation['outcome'] = 'TIMEOUT';
      let responseSeenAt: number | undefined;

      while (Date.now() < deadline) {
        transitionEvidence = await readTransitionEvidence(page, input.transition);
        const currentMessages = await extractStatusMessages(page);
        if (expectedResponse) {
          responseSeenAt ??= Date.now();
        }
        const classified = classifyActionObservation({
          transitionVisible: Boolean(transitionEvidence),
          requestFailed: networkErrors.length > 0,
          pageError: javascriptErrors.length > 0,
          visibleError: currentMessages.some((message) => !baselineMessages.has(message)),
          responseStatus: expectedResponse?.status(),
          successStatuses: input.expectedRequest?.successStatuses,
          responseGraceElapsed: responseSeenAt !== undefined && Date.now() - responseSeenAt >= 3_000,
          timedOut: false,
          expectedRequest: Boolean(input.expectedRequest),
          requestObserved: Boolean(expectedRequest),
        });
        if (classified) { outcome = classified; break; }
        await page.waitForTimeout(100);
      }
      if (outcome === 'TIMEOUT') outcome = classifyActionObservation({
        transitionVisible: false,
        requestFailed: networkErrors.length > 0,
        pageError: javascriptErrors.length > 0,
        visibleError: false,
        responseStatus: expectedResponse?.status(),
        successStatuses: input.expectedRequest?.successStatuses,
        responseGraceElapsed: true,
        timedOut: true,
        expectedRequest: Boolean(input.expectedRequest),
        requestObserved: Boolean(expectedRequest),
      }) ?? 'TIMEOUT';

      const resolved = await captureActionSnapshot(page, input);
      for (const [request, activity] of networkActivity) {
        const response = await request.response().catch(() => null);
        if (response) activity.responseSummary = (await summarizeResponse(response)).responseSummary;
      }
      const resolvedScreenshot = await captureRedactedScreenshot(page);
      const responseDetails = expectedResponse ? await summarizeResponse(expectedResponse) : {};
      return {
        stageKey: input.stageKey,
        actionKey: input.actionKey,
        outcome,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        actionResolution,
        ...(transitionEvidence ? { transitionEvidence } : {}),
        request: {
          observed: Boolean(expectedRequest),
          ...(expectedRequest ? {
            method: expectedRequest.method(),
            url: sanitizeDiagnosticUrl(expectedRequest.url()),
            structure: summarizeRequestStructure(expectedRequest),
            redirects: collectRedirects(expectedRequest),
          } : { redirects: [] }),
          ...(expectedResponse ? {
            status: expectedResponse.status(),
            ...(requestStartedAt === undefined || responseReceivedAt === undefined
              ? {} : { durationMs: responseReceivedAt - requestStartedAt }),
            ...responseDetails,
          } : {}),
        },
        networkErrors,
        javascriptErrors,
        consoleMessages,
        networkActivity: [...networkActivity.values()],
        before,
        after,
        resolved,
        screenshots: {
          before: beforeScreenshot,
          after: afterScreenshot,
          resolved: resolvedScreenshot,
          mimeType: 'image/png',
        },
      };
    } finally {
      await removeActionEventProbe(page).catch(() => undefined);
      page.off('request', onRequest);
      page.off('response', onResponse);
      page.off('requestfailed', onRequestFailed);
      page.off('pageerror', onPageError);
      page.off('console', onConsole);
    }
  }

  waitForHttpResponse(
    session: BrowserSession,
    matcher: HttpResponseMatcher,
    timeoutMs: number,
  ): Promise<ObservedHttpResponse> {
    const active = this.getSession(session);
    const observation = observeHttpResponse(active.page, matcher, timeoutMs);
    active.pendingResponses.add(observation);
    void observation.finally(() => active.pendingResponses.delete(observation));
    return observation;
  }

  async waitForStageTransition(
    session: BrowserSession,
    descriptor: StageTransitionDescriptor,
    timeoutMs: number,
  ): Promise<StageTransitionEvidence> {
    const page = this.getSession(session).page;
    const fieldLocators = (descriptor.visibleFields ?? []).map((field) => ({
      label: field.css ?? field.name ?? field.label ?? 'stage-field',
      locator: resolveFieldLocator(page, field),
    }));
    const fieldWaits = fieldLocators.map(({ label, locator }) =>
      tracePlaywright('locator.waitFor', label, timeoutMs, () => locator.waitFor({ state: 'visible', timeout: timeoutMs })));
    const textWait = descriptor.visibleText
      ? tracePlaywright('getByText.waitFor', descriptor.visibleText, timeoutMs, () =>
        page.getByText(descriptor.visibleText!, { exact: false }).waitFor({ state: 'visible', timeout: timeoutMs }))
      : undefined;
    const waits = [...fieldWaits, ...(textWait ? [textWait] : [])];
    if (waits.length === 0) throw new Error('Stage transition requires visible evidence');
    if (descriptor.match === 'all') await Promise.all(waits);
    else await Promise.any(waits);
    return {
      matchedFields: descriptor.match === 'all' ? fieldLocators.length : Math.min(fieldLocators.length, 1),
      expectedFields: fieldLocators.length,
      textMatched: descriptor.match === 'all' ? Boolean(textWait) : Boolean(textWait && fieldLocators.length === 0),
    };
  }

  async waitForSettled(session: BrowserSession): Promise<void> {
    const page = this.getSession(session).page;
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(1_000);
  }

  private getSession(session: BrowserSession): ActiveSession {
    const active = this.sessions.get(session.id);
    if (!active) throw new Error('Browser session is not active');
    return active;
  }

  private async visibleTexts(page: Page, selector: string): Promise<string[]> {
    return page.locator(selector).evaluateAll((elements: any[]) => elements
      .filter((element) => {
        const style = (globalThis as any).getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      })
      .map((element) => String(element.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 20));
  }
}

async function captureActionSnapshot(page: Page, input: ObservePortalActionInput): Promise<PortalActionSnapshot> {
  const action = await resolveActionState(page, input.form, input.action);
  const currentStageFieldStates = await readFieldStates(page, input.currentStageFields);
  const form = await readFormState(page, input.form);
  const observedEvents = await readActionEvents(page);
  return {
    url: sanitizeDiagnosticUrl(page.url()),
    action,
    statusMessages: await extractStatusMessages(page),
    currentStageFieldsVisible: await fieldVisibility(page, input.currentStageFields),
    nextStageFieldsVisible: await fieldVisibility(page, input.transition.visibleFields ?? []),
    currentStageFieldStates,
    form,
    observedEvents,
  };
}

async function readFieldStates(
  page: Page,
  fields: readonly Pick<FieldInteractionDescriptor, 'css' | 'label' | 'name'>[],
): Promise<PortalFieldState[]> {
  const states: PortalFieldState[] = [];
  for (const descriptor of fields) {
    const locator = resolveFieldLocator(page, descriptor);
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const field = locator.nth(index);
      if (!await field.isVisible()) continue;
      states.push(await field.evaluate((element: any, label) => ({
        locator: label,
        visible: true,
        valuePresent: String(element.value ?? '').length > 0,
        nativeValid: element.checkValidity(),
        frameworkValid: !element.classList.contains('ng-invalid') && element.getAttribute('aria-invalid') !== 'true',
        disabled: Boolean(element.disabled),
        readOnly: Boolean(element.readOnly),
      }), fieldDescriptorLabel(descriptor)));
    }
  }
  return states;
}

async function readFormState(
  page: Page,
  descriptor: FormLocatorDescriptor,
): Promise<{ nativeValid: boolean; frameworkValid: boolean } | null> {
  const anchor = descriptor.anchorInputSelector
    ? page.locator(descriptor.anchorInputSelector).filter({ visible: true })
    : page.getByLabel(descriptor.anchorLabel ?? '', { exact: true }).filter({ visible: true });
  if (await anchor.count() !== 1) return null;
  const form = anchor.locator(`xpath=ancestor::${descriptor.containerSelector}[1]`);
  if (await form.count() !== 1) return null;
  return form.evaluate((element: any) => ({
    nativeValid: element.checkValidity(),
    frameworkValid: !element.classList.contains('ng-invalid'),
  }));
}

export function assertStageFieldsReady(states: readonly PortalFieldState[]): void {
  const invalid = states.filter((state) => !state.visible || !state.valuePresent || !state.nativeValid || !state.frameworkValid || state.disabled || state.readOnly);
  if (invalid.length > 0) throw new PortalStageFieldsInvalidError(invalid);
}

async function installActionEventProbe(page: Page, form: FormLocatorDescriptor, action: ActionLocatorDescriptor): Promise<void> {
  await page.evaluate(({ form, action }) => {
    const global = globalThis as any;
    const dom = global.document;
    const anchor = form.anchorInputSelector
      ? dom.querySelector(form.anchorInputSelector)
      : [...dom.querySelectorAll('label')].find((label: any) => label.textContent?.trim() === form.anchorLabel)?.control;
    const root = anchor?.closest(form.containerSelector);
    global.__paeObservedActionEvents = [];
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
    const click = (event: Event) => {
      const target = event.target as any;
      const candidate = target?.closest(action.css ?? 'button,[role="button"]');
      const candidateText = String(candidate?.textContent ?? '');
      if (candidate && root?.contains(candidate) && (!action.text || normalize(candidateText) === normalize(action.text))) {
        global.__paeObservedActionEvents.push('click');
      }
    };
    const submit = (event: Event) => { if (event.target === root) global.__paeObservedActionEvents.push('submit'); };
    global.__paeActionProbe = { click, submit };
    dom.addEventListener('click', click, true);
    dom.addEventListener('submit', submit, true);
  }, { form, action });
}

async function readActionEvents(page: Page): Promise<('click' | 'submit')[]> {
  return page.evaluate(() => [...((globalThis as any).__paeObservedActionEvents ?? [])]);
}

async function removeActionEventProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const global = globalThis as any;
    const dom = global.document;
    if (global.__paeActionProbe) {
      dom.removeEventListener('click', global.__paeActionProbe.click, true);
      dom.removeEventListener('submit', global.__paeActionProbe.submit, true);
    }
    delete global.__paeActionProbe;
  });
}

export class PortalStageFieldsInvalidError extends Error {
  readonly code = 'PORTAL_STAGE_FIELDS_INVALID';
  constructor(readonly invalidFields: readonly PortalFieldState[]) {
    super(`PORTAL_STAGE_FIELDS_INVALID: ${invalidFields.map((field) => field.locator).join(', ')}`);
  }
}

async function resolveActionState(
  page: Page,
  form: FormLocatorDescriptor,
  action: ActionLocatorDescriptor,
): Promise<PortalActionSnapshot['action']> {
  const anchors = form.anchorInputSelector
    ? page.locator(form.anchorInputSelector)
    : page.getByLabel(form.anchorLabel ?? '', { exact: true });
  const count = await anchors.count();
  for (let index = 0; index < count; index += 1) {
    const anchor = anchors.nth(index);
    if (!await anchor.isVisible()) continue;
    const root = anchor.locator(`xpath=ancestor::${form.containerSelector}[1]`);
    let candidates = action.role
      ? root.getByRole(action.role, action.name ? { name: action.name, exact: true } : {})
      : root.locator(action.css ?? '*');
    if (action.css && action.role) candidates = candidates.and(root.locator(action.css));
    const candidateCount = await candidates.count();
    for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex += 1) {
      const candidate = candidates.nth(candidateIndex);
      const visible = await candidate.isVisible();
      const textMatches = action.text === undefined
        || normalizeActionText(await candidate.textContent()) === normalizeActionText(action.text);
      if (!visible || !textMatches) continue;
      const disabled = await candidate.isDisabled().catch(() => false);
      return {
        visible: true,
        enabled: !disabled,
        disabled,
        ariaDisabled: await candidate.getAttribute('aria-disabled'),
      };
    }
  }
  return { visible: false, enabled: false, disabled: false, ariaDisabled: null };
}

async function fieldVisibility(
  page: Page,
  fields: readonly Pick<FieldInteractionDescriptor, 'css' | 'label' | 'name'>[],
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  for (const field of fields) {
    const label = field.css ?? field.name ?? field.label ?? 'field';
    const locator = resolveFieldLocator(page, field);
    const count = await locator.count();
    let visible = false;
    for (let index = 0; index < count; index += 1) visible ||= await locator.nth(index).isVisible();
    result[label] = visible;
  }
  return result;
}

async function readTransitionEvidence(
  page: Page,
  descriptor: StageTransitionDescriptor,
): Promise<StageTransitionEvidence | undefined> {
  const fields = descriptor.visibleFields ?? [];
  const visibility = await fieldVisibility(page, fields);
  const matchedFields = Object.values(visibility).filter(Boolean).length;
  const textMatched = descriptor.visibleText
    ? await page.getByText(descriptor.visibleText, { exact: false }).isVisible().catch(() => false)
    : false;
  const checks = [...Object.values(visibility), ...(descriptor.visibleText ? [textMatched] : [])];
  const matched = descriptor.match === 'all' ? checks.length > 0 && checks.every(Boolean) : checks.some(Boolean);
  return matched ? { matchedFields, expectedFields: fields.length, textMatched } : undefined;
}

async function extractStatusMessages(page: Page): Promise<string[]> {
  return page.locator('[role="alert"], .alert, [class*="error" i], [id*="error" i], .modal:visible')
    .evaluateAll((elements: any[]) => elements
      .filter((element) => {
        const style = (globalThis as any).getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      })
      .map((element) => String(element.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 20))
    .then((messages) => messages.map(sanitizeDiagnosticText));
}

async function captureRedactedScreenshot(page: Page): Promise<Uint8Array> {
  await page.evaluate(() => {
    const dom = (globalThis as any).document;
    const style = dom.createElement('style');
    style.id = 'pae-diagnostic-redaction';
    style.textContent = 'input,select,textarea{color:transparent!important;text-shadow:0 0 10px #111!important;caret-color:transparent!important}';
    dom.documentElement.appendChild(style);
  });
  try {
    return await page.screenshot({ type: 'png', fullPage: false });
  } finally {
    await page.evaluate(() => (globalThis as any).document.querySelector('#pae-diagnostic-redaction')?.remove()).catch(() => undefined);
  }
}

function safePathname(rawUrl: string): string {
  try { return new URL(rawUrl).pathname; } catch { return ''; }
}

function sanitizeDiagnosticUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch { return '[invalid-url]'; }
}

function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b/gi, '[RFC]')
    .replace(/\b\d{8,}\b/g, '[NUMBER]')
    .replace(/(token|authorization|cookie|password|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 500);
}

function summarizeRequestStructure(request: Request): unknown {
  const data = request.postData();
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as unknown;
    return structureOnly(parsed);
  } catch {
    const params = new URLSearchParams(data);
    if ([...params.keys()].length > 0) {
      return Object.fromEntries([...new Set(params.keys())].map((key) => [key, { present: true, length: params.get(key)?.length ?? 0 }]));
    }
    return { type: 'opaque', length: data.length };
  }
}

function structureOnly(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(structureOnly);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, structureOnly(entry)]));
  }
  if (typeof value === 'string') return { type: 'string', present: value.length > 0, length: value.length };
  return { type: typeof value, present: value !== null };
}

async function summarizeResponse(response: Response): Promise<{
  responseContentType?: string;
  responseSummary?: unknown;
}> {
  const contentType = response.headers()['content-type'];
  const text = await response.text().catch(() => '');
  let summary: unknown;
  try {
    summary = sanitizeResponseValue(JSON.parse(text) as unknown);
  } catch {
    summary = text ? sanitizeDiagnosticText(text) : null;
  }
  return {
    ...(contentType ? { responseContentType: contentType.split(';')[0] } : {}),
    responseSummary: summary,
  };
}

function sanitizeResponseValue(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => sanitizeResponseValue(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 50).map(([entryKey, entry]) => [entryKey, sanitizeResponseValue(entry, entryKey)]));
  }
  if (typeof value === 'string') {
    return /message|error|status|code|reason|detail/i.test(key)
      ? sanitizeDiagnosticText(value)
      : { type: 'string', present: value.length > 0, length: value.length };
  }
  return value;
}

function collectRedirects(request: Request): string[] {
  const redirects: string[] = [];
  let current = request.redirectedFrom();
  while (current) {
    redirects.unshift(sanitizeDiagnosticUrl(current.url()));
    current = current.redirectedFrom();
  }
  return redirects;
}

export function classifyActionObservation(input: {
  transitionVisible: boolean;
  requestFailed: boolean;
  pageError: boolean;
  visibleError: boolean;
  responseStatus?: number | undefined;
  successStatuses?: readonly number[] | undefined;
  responseGraceElapsed: boolean;
  timedOut: boolean;
  expectedRequest: boolean;
  requestObserved: boolean;
}): PortalActionObservation['outcome'] | undefined {
  if (input.transitionVisible) return 'STAGE_TRANSITION';
  if (input.requestFailed) return 'REQUEST_FAILED';
  if (input.pageError) return 'PAGE_ERROR';
  if (input.visibleError) return 'VISIBLE_ERROR';
  if (input.responseStatus !== undefined) {
    const successful = input.successStatuses?.length
      ? input.successStatuses.includes(input.responseStatus)
      : input.responseStatus >= 200 && input.responseStatus < 400;
    if (!successful) return 'ACTION_RESPONSE_REJECTED';
    if (input.responseGraceElapsed) return 'ACTION_RESPONSE_SUCCESS_BUT_STAGE_NOT_VISIBLE';
  }
  if (input.timedOut && input.expectedRequest && !input.requestObserved) return 'EXPECTED_ACTION_REQUEST_NOT_OBSERVED';
  if (input.timedOut) return 'TIMEOUT';
  return undefined;
}

export function sanitizePortalDiagnostic(value: string): string {
  return sanitizeDiagnosticText(value);
}

type ResponseEventSource = {
  on(event: 'request', listener: (request: Request) => void): unknown;
  on(event: 'response', listener: (response: Response) => void): unknown;
  off(event: 'request', listener: (request: Request) => void): unknown;
  off(event: 'response', listener: (response: Response) => void): unknown;
};

export function observeHttpResponse(
  source: ResponseEventSource,
  matcher: HttpResponseMatcher,
  timeoutMs: number,
): Promise<ObservedHttpResponse> {
  let requestObserved = false;
  let startedAt: number | null = null;
  let settled = false;
  let timer: NodeJS.Timeout | undefined;
  const matches = (method: string, rawUrl: string) => {
    try {
      return method.toUpperCase() === matcher.method.toUpperCase() && new URL(rawUrl).pathname === matcher.pathname;
    } catch {
      return false;
    }
  };
  return new Promise<ObservedHttpResponse>((resolve) => {
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      source.off('request', onRequest);
      source.off('response', onResponse);
    };
    const finish = (result: ObservedHttpResponse) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const onRequest = (request: Request) => {
      if (matches(request.method(), request.url())) {
        requestObserved = true;
        startedAt = Date.now();
      }
    };
    const onResponse = (response: Response) => {
      const request = response.request();
      if (!matches(request.method(), request.url())) return;
      finish({
        requestObserved: true,
        responseReceived: true,
        status: response.status(),
        durationMs: startedAt === null ? null : Date.now() - startedAt,
      });
    };
    source.on('request', onRequest);
    source.on('response', onResponse);
    timer = setTimeout(() => finish({ requestObserved, responseReceived: false, status: null, durationMs: null }), timeoutMs);
  });
}

function normalizeActionText(value: string | null): string {
  return (value ?? '').replace(/[\uE000-\uF8FF]/g, '').replace(/\s+/g, ' ').trim();
}

function escapeAttribute(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function resolveFieldLocator(page: Page, descriptor: Pick<FieldInteractionDescriptor, 'css' | 'label' | 'name'>) {
  if (descriptor.css) return page.locator(descriptor.css);
  if (descriptor.label) return page.getByLabel(descriptor.label, { exact: true });
  if (descriptor.name) return page.locator(`[name="${escapeAttribute(descriptor.name)}"]`);
  throw new Error('Field locator descriptor requires css, label, or name');
}

function fieldDescriptorLabel(descriptor: Pick<FieldInteractionDescriptor, 'css' | 'label' | 'name'>): string {
  return descriptor.css ?? descriptor.label ?? descriptor.name ?? 'field';
}

export class FieldLocatorAmbiguousError extends Error {
  readonly code = 'FIELD_LOCATOR_AMBIGUOUS';

  constructor(
    readonly descriptor: FieldInteractionDescriptor,
    readonly totalCount: number,
    readonly visibleCount: number,
  ) {
    super(`FIELD_LOCATOR_AMBIGUOUS: expected one visible field; found ${visibleCount} visible of ${totalCount} total`);
  }
}

export function assertFormAndActionResolution(
  formDescriptor: FormLocatorDescriptor,
  descriptor: ActionLocatorDescriptor,
  resolution: Omit<ActionLocatorResult, 'containerSelector'>,
): void {
  if (
    resolution.anchorVisibleCount !== formDescriptor.expectedVisibleCount
    || resolution.anchorVisibleCount !== 1
    || resolution.formVisibleCount !== 1
    || resolution.visibleCount !== descriptor.expectedCount
    || resolution.visibleCount !== 1
  ) {
    throw new FormOrActionAmbiguousError(formDescriptor, descriptor, resolution);
  }
}

function writeActionResolution(
  formDescriptor: FormLocatorDescriptor,
  descriptor: ActionLocatorDescriptor,
  resolution: ActionLocatorResult,
): void {
  process.stderr.write(`${JSON.stringify({
    component: 'PortalActionLocator', anchor: formDescriptor.anchorInputSelector ?? formDescriptor.anchorLabel,
    container: formDescriptor.containerSelector, ...resolution, expectedCount: descriptor.expectedCount,
  })}\n`);
}

export class FormOrActionAmbiguousError extends Error {
  readonly code = 'FORM_OR_ACTION_AMBIGUOUS';

  constructor(
    readonly formDescriptor: FormLocatorDescriptor,
    readonly descriptor: ActionLocatorDescriptor,
    readonly resolution: Omit<ActionLocatorResult, 'containerSelector'>,
  ) {
    super(`FORM_OR_ACTION_AMBIGUOUS: expected one visible form anchored by ${formDescriptor.anchorInputSelector ?? formDescriptor.anchorLabel} and one visible action; found ${resolution.anchorVisibleCount} forms and ${resolution.visibleCount} actions`);
  }
}

async function tracePlaywright<T>(
  method: string,
  selector: string | undefined,
  timeoutMs: number,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date();
  const callSite = new Error().stack?.split('\n')[2]?.trim() ?? 'unknown';
  try {
    const result = await operation();
    writePlaywrightTrace({ method, selector, timeoutMs, callSite, startedAt, success: true });
    return result;
  } catch (error) {
    writePlaywrightTrace({ method, selector, timeoutMs, callSite, startedAt, success: false, error });
    throw error;
  }
}

function writePlaywrightTrace(input: {
  method: string;
  selector: string | undefined;
  timeoutMs: number;
  callSite: string;
  startedAt: Date;
  success: boolean;
  error?: unknown;
}): void {
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - input.startedAt.getTime();
  const error = input.error instanceof Error ? input.error : undefined;
  process.stderr.write(`${JSON.stringify({
    component: 'Playwright',
    fileAndLine: input.callSite,
    method: input.method,
    selector: input.selector,
    timeoutMs: input.timeoutMs,
    startedAt: input.startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    success: input.success,
    slowReason: durationMs > 2_000
      ? (error?.message ?? 'Playwright remained pending on browser, network, or DOM readiness')
      : undefined,
    errorName: error?.name,
    errorMessage: error?.message,
    originalStack: error?.stack,
  })}\n`);
}

export class PortalNavigationError extends Error {
  constructor(readonly code: 'DOMAIN_BLOCKED' | 'REDIRECT_BLOCKED', message: string) {
    super(message);
  }
}
