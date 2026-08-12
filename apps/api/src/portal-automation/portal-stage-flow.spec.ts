/* eslint-disable @typescript-eslint/unbound-method */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type {
  ActionLocatorDescriptor,
  BrowserProvider,
  BrowserSession,
  FormLocatorDescriptor,
  ObservePortalActionInput,
} from './browser-provider';
import { CostcoInvoiceReadOnlyAdapter } from './costco-invoice-read-only.adapter';
import { PortalStageFlowEngine, type PortalStageDescriptor, type StagedPortalAdapter } from './portal-stage-flow';

const session: BrowserSession = { id: 'session' };
const resolution = {
  anchorTotalCount: 1,
  anchorVisibleCount: 1,
  formVisibleCount: 1,
  totalCount: 1,
  visibleCount: 1,
  containerSelector: 'form',
};
const observation = {
  stageKey: 'STAGE', actionKey: 'ACTION', outcome: 'STAGE_TRANSITION' as const,
  startedAt: new Date(0).toISOString(), finishedAt: new Date(1).toISOString(),
  actionResolution: resolution,
  transitionEvidence: { matchedFields: 1, expectedFields: 1, textMatched: false },
  request: { observed: false, redirects: [] },
  networkErrors: [], javascriptErrors: [], consoleMessages: [],
  before: { url: 'https://portal.example/start', action: { visible: true, enabled: true, disabled: false, ariaDisabled: null }, statusMessages: [], currentStageFieldsVisible: {}, nextStageFieldsVisible: {} },
  after: { url: 'https://portal.example/start', action: { visible: true, enabled: true, disabled: false, ariaDisabled: null }, statusMessages: [], currentStageFieldsVisible: {}, nextStageFieldsVisible: {} },
  resolved: { url: 'https://portal.example/start', action: { visible: true, enabled: true, disabled: false, ariaDisabled: null }, statusMessages: [], currentStageFieldsVisible: {}, nextStageFieldsVisible: {} },
  screenshots: { before: new Uint8Array(), after: new Uint8Array(), resolved: new Uint8Array(), mimeType: 'image/png' as const },
};

function browserHarness(): BrowserProvider {
  return {
    createSession: vi.fn().mockResolvedValue(session),
    closeSession: vi.fn().mockResolvedValue(undefined),
    navigate: vi.fn().mockResolvedValue({ finalUrl: 'https://portal.example/start', observedDomains: ['portal.example'], blockedDomains: [] }),
    waitForPortalReady: vi.fn().mockResolvedValue(undefined),
    getPageMetadata: vi.fn().mockResolvedValue({ title: 'Portal', url: 'https://portal.example/start' }),
    captureScreenshot: vi.fn().mockResolvedValue('screenshot.png'),
    extractVisibleElements: vi.fn().mockResolvedValue({ fields: [], buttons: [], headings: [], statusMessages: [], captchaDetected: false, loginDetected: false, legalMessages: [] }),
    fillField: vi.fn().mockResolvedValue(undefined),
    interactWithField: vi.fn().mockResolvedValue(undefined),
    clickAction: vi.fn().mockResolvedValue(resolution),
    observeAction: vi.fn((_session: BrowserSession, input: ObservePortalActionInput) =>
      Promise.resolve({ ...observation, stageKey: input.stageKey, actionKey: input.actionKey })),
    waitForHttpResponse: vi.fn().mockResolvedValue({ requestObserved: false, responseReceived: false, status: null, durationMs: null }),
    waitForStageTransition: vi.fn().mockResolvedValue({ matchedFields: 1, expectedFields: 1, textMatched: false }),
    waitForSettled: vi.fn().mockResolvedValue(undefined),
  };
}

function stage(key: string, inputKey: string, actionKey: string): PortalStageDescriptor<string> {
  const form: FormLocatorDescriptor = {
    anchorInputSelector: `input[name="${inputKey}"]`,
    containerSelector: 'form',
    expectedVisibleCount: 1,
  };
  return {
    key,
    readySelector: `input[name="${inputKey}"]`,
    fields: [{ inputKey, locator: { name: inputKey, control: 'text', expectedVisibleCount: 1 } }],
    form,
    actionKey,
    transition: { visibleFields: [{ name: `${key}-next` }], match: 'all' },
  };
}

function adapter(stages: readonly PortalStageDescriptor<string>[]): StagedPortalAdapter<string> {
  return {
    adapterKey: 'GENERIC_ADAPTER',
    portalUrl: 'https://portal.example/start',
    allowedDomains: ['portal.example'],
    getStages: () => stages,
    getActionLocator: (actionKey): ActionLocatorDescriptor => ({ role: 'button', name: actionKey, expectedCount: 1, visibleOnly: true }),
    resolveOutcome: (stageKey) => stageKey === stages.at(-1)?.key ? 'ACCEPTED_PENDING' : undefined,
  };
}

describe('PortalStageFlowEngine', () => {
  it('executes multiple declared stages in order and waits for each visible transition', async () => {
    const browser = browserHarness();
    const stages = [stage('ONE', 'first', 'NEXT'), stage('TWO', 'second', 'SUBMIT')];
    const result = await new PortalStageFlowEngine().execute(browser, session, adapter(stages), { first: 'a', second: 'b' }, 5_000);
    expect(browser.interactWithField).toHaveBeenCalledTimes(2);
    expect(browser.observeAction).toHaveBeenCalledTimes(2);
    expect(result.stages.map((entry) => entry.stageKey)).toEqual(['ONE', 'TWO']);
  });

  it('does not touch second-stage fields before first-stage transition evidence', async () => {
    const browser = browserHarness();
    const stages = [stage('ONE', 'first', 'NEXT'), stage('TWO', 'second', 'SUBMIT')];
    await new PortalStageFlowEngine().execute(browser, session, adapter(stages), { first: 'a', second: 'b' }, 5_000);
    expect(vi.mocked(browser.observeAction).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(browser.interactWithField).mock.invocationCallOrder[1]!);
  });

  it('accepts ACCEPTED_PENDING as a final portal outcome', async () => {
    const browser = browserHarness();
    const result = await new PortalStageFlowEngine().execute(browser, session, adapter([stage('FINAL', 'value', 'SEND')]), { value: 'x' }, 5_000);
    expect(result.outcome).toBe('ACCEPTED_PENDING');
  });

  it.each([1, 2, 3])('supports an adapter with %i stage(s) without engine changes', async (count) => {
    const stages = Array.from({ length: count }, (_, index) => stage(`STAGE_${index}`, `value${index}`, `ACTION_${index}`));
    const input = Object.fromEntries(stages.map((_, index) => [`value${index}`, String(index)]));
    const result = await new PortalStageFlowEngine().execute(browserHarness(), session, adapter(stages), input, 5_000);
    expect(result.stages).toHaveLength(count);
  });

  it('contains no Costco-specific business names in the universal engine', () => {
    const source = readFileSync(join(__dirname, 'portal-stage-flow.ts'), 'utf8').toLowerCase();
    expect(source).not.toMatch(/costco|ticket|rfc|raz[oó]n social|cfdi/);
  });
});

describe('Costco staged adapter', () => {
  const completeProfile = {
    status: 'ACTIVE', approvedAt: new Date(), rfc: 'BELE880510NG3', legalName: 'ESLI MAYTANE BENITEZ LANDA',
    postalCode: '91045', taxRegime: '626 - Regime', cfdiUse: 'G03 - General', billingEmail: 'billing@example.com',
  } as const;

  it('selects only a 20 digit BARCODE as Costco comprobante', () => {
    const costco = new CostcoInvoiceReadOnlyAdapter();
    const context = {
      documentNumber: '2518', totalAmount: '1383.26', taxProfile: completeProfile,
      documentIdentifiers: [
        { type: 'TICKET_NUMBER' as const, value: '2518' },
        { type: 'AUTHORIZATION_NUMBER' as const, value: '842777' },
        { type: 'BARCODE' as const, value: '71901102120708261246' },
      ],
    };
    expect(costco.resolveDocumentNumber(context)).toBe('71901102120708261246');
  });

  it('rejects ticket numbers, authorization numbers and card last4 as Costco comprobante', () => {
    const costco = new CostcoInvoiceReadOnlyAdapter();
    const context = { documentNumber: '0633', totalAmount: '1383.26', taxProfile: completeProfile };
    expect(costco.resolveDocumentNumber(context)).toBeUndefined();
    expect(() => costco.validatePreflight(context)).toThrowError(/COSTCO_COMPROBANTE_INVALID/);
  });

  it('accepts a complete Costco preflight and maps all stage-two fiscal fields', () => {
    const costco = new CostcoInvoiceReadOnlyAdapter();
    const context = { documentNumber: '71901102120708261246', totalAmount: '1383.26', taxProfile: completeProfile };
    expect(() => costco.validatePreflight(context)).not.toThrow();
    expect(costco.buildInvoiceFlowInput(context)).toEqual({
      ticketOrOrder: '71901102120708261246', totalPaid: '1383.26', rfc: 'BELE880510NG3',
      legalName: 'ESLI MAYTANE BENITEZ LANDA', postalCode: '91045', taxRegime: '626', cfdiUse: 'G03',
      billingEmail: 'billing@example.com', billingEmailConfirmation: 'billing@example.com',
    });
  });

  it('declares purchase identification and fiscal-data stages', () => {
    const stages = new CostcoInvoiceReadOnlyAdapter().getStages();
    expect(stages.map((entry) => entry.key)).toEqual(['IDENTIFY_PURCHASE', 'TAX_DATA']);
    expect(stages[0]?.transition.visibleFields?.map((field) => field.label)).toEqual([
      'Nombre/Razón Social', 'Código Postal', 'Régimen Fiscal', 'Uso de CFDI',
    ]);
    expect(stages[1]?.transition.visibleText).toContain('Su solicitud fue aceptada');
  });

  it('maps a complete active approved TaxProfile without hardcoded fiscal values', () => {
    const input = new CostcoInvoiceReadOnlyAdapter().buildFlowInput(
      { ticketOrOrder: 'purchase', totalPaid: '100.00', rfc: 'ignored-purchase-rfc' },
      {
        status: 'ACTIVE', approvedAt: new Date(), rfc: 'PROFILE-RFC', legalName: 'Legal Name',
        postalCode: '91045', taxRegime: '626 - Regime', cfdiUse: 'G03 - General', billingEmail: 'billing@example.com',
      },
    );
    expect(input).toMatchObject({
      rfc: 'PROFILE-RFC', legalName: 'Legal Name', postalCode: '91045', taxRegime: '626',
      cfdiUse: 'G03', billingEmail: 'billing@example.com', billingEmailConfirmation: 'billing@example.com',
    });
  });

  it('rejects an incomplete or unapproved TaxProfile before browser execution', () => {
    const costco = new CostcoInvoiceReadOnlyAdapter();
    expect(() => costco.buildFlowInput(
      { ticketOrOrder: 'purchase', totalPaid: '100.00', rfc: 'rfc' },
      { status: 'ACTIVE', approvedAt: null, rfc: 'rfc', legalName: 'Name', postalCode: '91045', taxRegime: '626', cfdiUse: 'G03', billingEmail: 'a@b.mx' },
    )).toThrow(/active and approved/i);
    expect(() => costco.buildFlowInput(
      { ticketOrOrder: 'purchase', totalPaid: '100.00', rfc: 'rfc' },
      { status: 'ACTIVE', approvedAt: new Date(), rfc: 'rfc', legalName: 'Name', postalCode: null, taxRegime: '626', cfdiUse: 'G03', billingEmail: 'a@b.mx' },
    )).toThrow(/postalCode/);
  });
});
