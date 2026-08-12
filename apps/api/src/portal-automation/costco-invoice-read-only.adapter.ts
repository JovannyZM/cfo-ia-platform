import { Injectable, Optional } from '@nestjs/common';
import type { ActionLocatorDescriptor, ActionLocatorResult, BrowserProvider, BrowserSession, FormLocatorDescriptor, PortalActionAdapter, VisibleField } from './browser-provider';
import type { PortalFlowOutcome, PortalStageDescriptor, StagedPortalAdapter } from './portal-stage-flow';
import { PortalAdapterRegistry, type AutomatedInvoicePortalContext } from './portal-adapter.registry';

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

export type CostcoFiscalTaxProfile = {
  status: string;
  approvedAt: Date | string | null;
  rfc: string;
  legalName: string;
  postalCode: string | null;
  taxRegime: string | null;
  cfdiUse: string | null;
  billingEmail: string | null;
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
export class CostcoInvoiceReadOnlyAdapter implements PortalActionAdapter<'CONTINUE' | 'REQUEST'>, StagedPortalAdapter<'CONTINUE' | 'REQUEST'> {
  readonly adapterKey = COSTCO_READ_ONLY_ADAPTER_KEY;
  readonly portalUrl = COSTCO_INVOICE_URL;
  readonly allowedDomains = COSTCO_ALLOWED_DOMAINS;
  readonly merchantKeys = ['COSTCO'] as const;

  constructor(@Optional() registry?: PortalAdapterRegistry) {
    registry?.register(this);
  }

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

  getActionLocator(actionKey: 'CONTINUE' | 'REQUEST'): ActionLocatorDescriptor {
    if (actionKey === 'CONTINUE') {
      return { css: 'button#btnEnviar.basic-button', text: 'Continuar', visibleOnly: true, expectedCount: 1 };
    }
    if (actionKey === 'REQUEST') {
      return { css: 'button.basic-button', text: 'Solicitar', visibleOnly: true, expectedCount: 1 };
    }
    throw new Error(`Unsupported action: ${String(actionKey)}`);
  }

  getStages(): readonly PortalStageDescriptor<'CONTINUE' | 'REQUEST'>[] {
    const normalEvents = ['input', 'change', 'blur'] as const;
    return [
      {
        key: 'IDENTIFY_PURCHASE',
        readySelector: this.getReadySelector(),
        fields: [
          { inputKey: 'ticketOrOrder', locator: { name: 'ticket', control: 'text', expectedVisibleCount: 1, events: normalEvents } },
          { inputKey: 'totalPaid', locator: { name: 'monto', control: 'text', expectedVisibleCount: 1, inputMethod: 'press-sequentially', events: ['blur'] } },
          { inputKey: 'rfc', locator: { name: 'rfc', control: 'text', expectedVisibleCount: 1, events: normalEvents } },
        ],
        form: this.getFormLocator(),
        actionKey: 'CONTINUE',
        expectedActionRequest: {
          method: 'POST',
          pathname: '/portales/invoice/validateCheck',
          successStatuses: [200, 201, 459],
        },
        transition: {
          visibleFields: [
            { label: 'Nombre/Razón Social' },
            { label: 'Código Postal' },
            { label: 'Régimen Fiscal' },
            { label: 'Uso de CFDI' },
          ],
          match: 'all',
        },
      },
      {
        key: 'TAX_DATA',
        fields: [
          { inputKey: 'legalName', locator: { label: 'Nombre/Razón Social', control: 'text', expectedVisibleCount: 1, events: normalEvents } },
          { inputKey: 'postalCode', locator: { label: 'Código Postal', control: 'text', expectedVisibleCount: 1, events: normalEvents } },
          { inputKey: 'taxRegime', locator: { label: 'Régimen Fiscal', control: 'select', expectedVisibleCount: 1, events: ['change', 'blur'] } },
          { inputKey: 'cfdiUse', locator: { label: 'Uso de CFDI', control: 'select', expectedVisibleCount: 1, events: ['change', 'blur'] } },
          { inputKey: 'billingEmail', locator: { label: 'Correo Electrónico', control: 'text', expectedVisibleCount: 1, events: normalEvents } },
          { inputKey: 'billingEmailConfirmation', locator: { label: 'Confirmación de Correo', control: 'text', expectedVisibleCount: 1, events: normalEvents } },
        ],
        form: { anchorLabel: 'Nombre/Razón Social', containerSelector: 'form', expectedVisibleCount: 1 },
        actionKey: 'REQUEST',
        transition: {
          visibleText: 'Su solicitud fue aceptada y en un plazo no mayor a 72 horas se informará del estatus',
          match: 'all',
        },
      },
    ];
  }

  resolveOutcome(stageKey: string): PortalFlowOutcome | undefined {
    return stageKey === 'TAX_DATA' ? 'ACCEPTED_PENDING' : undefined;
  }

  buildFlowInput(
    purchase: CostcoInitialValidationInput,
    taxProfile: CostcoFiscalTaxProfile,
  ): Readonly<Record<string, string>> {
    if (taxProfile.status !== 'ACTIVE' || !taxProfile.approvedAt) {
      throw new Error('TaxProfile must be active and approved');
    }
    const required = {
      rfc: taxProfile.rfc,
      legalName: taxProfile.legalName,
      postalCode: taxProfile.postalCode,
      taxRegime: taxProfile.taxRegime,
      cfdiUse: taxProfile.cfdiUse,
      billingEmail: taxProfile.billingEmail,
    };
    const missing = Object.entries(required).filter(([, value]) => !value?.trim()).map(([key]) => key);
    if (missing.length > 0) throw new Error(`TaxProfile is incomplete: ${missing.join(', ')}`);
    const taxRegime = required.taxRegime!.match(/^\s*(\d{3})/)?.[1] ?? required.taxRegime!;
    const cfdiUse = required.cfdiUse!.match(/^\s*([A-Z]\d{2})/i)?.[1]?.toUpperCase() ?? required.cfdiUse!;
    return {
      ticketOrOrder: purchase.ticketOrOrder,
      totalPaid: purchase.totalPaid,
      rfc: required.rfc,
      legalName: required.legalName,
      postalCode: required.postalCode!,
      taxRegime,
      cfdiUse,
      billingEmail: required.billingEmail!,
      billingEmailConfirmation: required.billingEmail!,
    };
  }

  buildInvoiceFlowInput(context: AutomatedInvoicePortalContext): Readonly<Record<string, string>> {
    const documentNumber = this.resolveDocumentNumber(context);
    const validated = { ...context, ...(documentNumber ? { documentNumber } : {}) };
    this.validatePreflight(validated);
    return this.buildFlowInput(
      { ticketOrOrder: documentNumber!, totalPaid: context.totalAmount, rfc: context.taxProfile.rfc },
      context.taxProfile,
    );
  }

  resolveDocumentNumber(context: AutomatedInvoicePortalContext): string | undefined {
    const barcode = context.documentIdentifiers?.find((identifier) =>
      identifier.type === 'BARCODE' && /^\d{20}$/u.test(identifier.value.trim()));
    if (barcode) return barcode.value.trim();
    const fallback = context.documentNumber.trim();
    return /^\d{20}$/u.test(fallback) ? fallback : undefined;
  }

  validatePreflight(context: AutomatedInvoicePortalContext): void {
    if (!/^\d{20}$/u.test(context.documentNumber)) {
      throw new CostcoPreflightError('COSTCO_COMPROBANTE_INVALID');
    }
    if (!/^\d+(?:\.\d+)?$/u.test(context.totalAmount) || Number(context.totalAmount) <= 0) {
      throw new CostcoPreflightError('COSTCO_AMOUNT_INVALID');
    }
    this.buildFlowInput(
      { ticketOrOrder: context.documentNumber, totalPaid: context.totalAmount, rfc: context.taxProfile.rfc },
      context.taxProfile,
    );
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

export class CostcoPreflightError extends Error {
  readonly code = 'COSTCO_PREFLIGHT_FAILED';
}
