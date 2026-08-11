/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page, type Request, type Response } from 'playwright';
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
