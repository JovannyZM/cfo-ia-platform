import { Injectable } from '@nestjs/common';
import type { ActionLocatorDescriptor, ActionLocatorResult, BrowserProvider, BrowserSession, FormLocatorDescriptor, PortalActionAdapter, VisibleField } from './browser-provider';

export const COSTCO_READ_ONLY_ADAPTER_KEY = 'COSTCO_INVOICE_READ_ONLY';
export const COSTCO_INVOICE_URL = 'https://www3.costco.com.mx/facturacion';
export const COSTCO_ALLOWED_DOMAINS = ['costco.com.mx'] as const;

export type CostcoReadOnlyProbeResult = {
  success: boolean;
  adapterKey: typeof COSTCO_READ_ONLY_ADAPTER_KEY;
  finalUrl: string;
  pageTitle: string;
  observedDomains: readonly string[];
  blockedDomains: readonly string[];
  visibleFields: readonly VisibleField[];
  visibleButtons: readonly string[];
  captchaDetected: boolean;
  loginDetected: boolean;
  legalMessages: readonly string[];
  screenshotReference: string;
  warnings: readonly string[];
};

export type CostcoInitialValidationInput = {
  ticketOrOrder: string;
  totalPaid: string;
  rfc: string;
};

export type CostcoControlledProbeResult = CostcoReadOnlyProbeResult & {
  screenReached: string;
  statusMessages: readonly string[];
  validationResponse: {
    requestObserved: boolean;
    responseReceived: boolean;
    status: number | null;
    durationMs: number | null;
  };
  actionResolution: ActionLocatorResult;
};

@Injectable()
export class CostcoInvoiceReadOnlyAdapter implements PortalActionAdapter<'CONTINUE'> {
  readonly adapterKey = COSTCO_READ_ONLY_ADAPTER_KEY;

  getReadySelector(): string {
    return 'input[name="ticket"]';
  }

  getFormLocator(): FormLocatorDescriptor {
    return {
      anchorLabel: 'Ticket / Orden',
      anchorInputSelector: 'input[name="ticket"]',
      containerSelector: 'form',
      expectedVisibleCount: 1,
    };
  }

  getActionLocator(actionKey: 'CONTINUE'): ActionLocatorDescriptor {
    if (actionKey !== 'CONTINUE') throw new Error(`Unsupported action: ${String(actionKey)}`);
    return {
      css: 'button#btnEnviar.basic-button',
      text: 'Continuar',
      visibleOnly: true,
      expectedCount: 1,
    };
  }

  async execute(
    provider: BrowserProvider,
    session: BrowserSession,
    screenshotReference: string,
  ): Promise<CostcoReadOnlyProbeResult> {
    const navigation = await provider.navigate(session, COSTCO_INVOICE_URL);
    await provider.waitForPortalReady(session, this.getReadySelector(), 60_000);
    const metadata = await provider.getPageMetadata(session);
    const elements = await provider.extractVisibleElements(session);
    const screenshot = await provider.captureScreenshot(session, screenshotReference);
    const warnings: string[] = [];
    if (!metadata.title.trim()) warnings.push('The portal returned an empty page title');
    if (elements.fields.length === 0) warnings.push('No visible form fields were detected');
    if (navigation.blockedDomains.length > 0) warnings.push(`Third-party domains were blocked: ${navigation.blockedDomains.join(', ')}`);
    if (elements.captchaDetected) warnings.push('Human CAPTCHA or security-code intervention may be required');
    if (elements.loginDetected) warnings.push('Login controls were detected');
    return {
      success: true,
      adapterKey: this.adapterKey,
      finalUrl: navigation.finalUrl,
      pageTitle: metadata.title,
      observedDomains: navigation.observedDomains,
      blockedDomains: navigation.blockedDomains,
      visibleFields: elements.fields,
      visibleButtons: elements.buttons,
      captchaDetected: elements.captchaDetected,
      loginDetected: elements.loginDetected,
      legalMessages: elements.legalMessages,
      screenshotReference: screenshot,
      warnings,
    };
  }

  async executeInitialValidation(
    provider: BrowserProvider,
    session: BrowserSession,
    screenshotReference: string,
    input: CostcoInitialValidationInput,
  ): Promise<CostcoControlledProbeResult> {
    const navigation = await provider.navigate(session, COSTCO_INVOICE_URL);
    await provider.waitForPortalReady(session, this.getReadySelector(), 60_000);
    const initialElements = await provider.extractVisibleElements(session);
    const requiredNames = new Set(initialElements.fields.map((field) => field.name));
    for (const name of ['ticket', 'monto', 'rfc']) {
      if (!requiredNames.has(name)) throw new Error(`Expected initial field was not found: ${name}`);
    }
    const screenshot = await provider.captureScreenshot(session, screenshotReference);
    await provider.fillField(session, 'ticket', input.ticketOrOrder);
    await provider.fillField(session, 'monto', input.totalPaid);
    await provider.fillField(session, 'rfc', input.rfc);
    const validationResponsePromise = provider.waitForHttpResponse(
      session,
      { method: 'POST', pathname: '/portales/invoice/validateCheck' },
      60_000,
    );
    let clickError: unknown;
    let actionResolution: ActionLocatorResult | undefined;
    try {
      actionResolution = await provider.clickAction(
        session,
        this.getFormLocator(),
        this.getActionLocator('CONTINUE'),
      );
    } catch (error) {
      clickError = error;
    }
    const validationResponse = await validationResponsePromise;
    if (clickError) throw clickError instanceof Error ? clickError : new Error('Continue action failed');
    if (!actionResolution) throw new Error('Continue action completed without a locator resolution');

    const metadata = await provider.getPageMetadata(session);
    const elements = await provider.extractVisibleElements(session);
    const warnings: string[] = [];
    if (navigation.blockedDomains.length > 0) warnings.push(`Third-party domains were blocked: ${navigation.blockedDomains.join(', ')}`);
    if (elements.captchaDetected) warnings.push('Human CAPTCHA or security-code intervention may be required');
    if (elements.loginDetected) warnings.push('Login controls were detected');
    return {
      success: true,
      adapterKey: this.adapterKey,
      finalUrl: metadata.url,
      pageTitle: metadata.title,
      observedDomains: navigation.observedDomains,
      blockedDomains: navigation.blockedDomains,
      visibleFields: elements.fields,
      visibleButtons: elements.buttons,
      captchaDetected: elements.captchaDetected,
      loginDetected: elements.loginDetected,
      legalMessages: elements.legalMessages,
      screenshotReference: screenshot,
      warnings,
      screenReached: elements.headings[0] ?? metadata.title,
      statusMessages: elements.statusMessages,
      validationResponse,
      actionResolution,
    };
  }
}
