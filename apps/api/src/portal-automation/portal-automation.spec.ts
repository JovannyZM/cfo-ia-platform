/* eslint-disable @typescript-eslint/unbound-method */
import { ConfigService } from '@nestjs/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { BrowserProvider, BrowserSession, ObservedHttpResponse } from './browser-provider';
import { isAllowedPortalUrl } from './browser-provider';
import { CostcoInvoiceReadOnlyAdapter } from './costco-invoice-read-only.adapter';
import { FormOrActionAmbiguousError, assertFormAndActionResolution } from './playwright-browser.provider';
import { PortalProbeService } from './portal-probe.service';
import type { PortalSessionService } from './portal-session.service';

const browserSession: BrowserSession = { id: 'browser-session' };

function harness(input: {
  enabled?: boolean;
  navigateError?: Error;
  navigateDelayMs?: number;
  timeoutMs?: number;
  validationResponse?: Promise<ObservedHttpResponse>;
} = {}) {
  const browser: BrowserProvider = {
    createSession: vi.fn().mockResolvedValue(browserSession), closeSession: vi.fn().mockResolvedValue(undefined),
    navigate: vi.fn(async () => {
      if (input.navigateDelayMs) await new Promise((resolve) => setTimeout(resolve, input.navigateDelayMs));
      if (input.navigateError) throw input.navigateError;
      return { finalUrl: 'https://www3.costco.com.mx/facturacion', observedDomains: ['www3.costco.com.mx'], blockedDomains: [] };
    }),
    waitForPortalReady: vi.fn().mockResolvedValue(undefined),
    getPageMetadata: vi.fn().mockResolvedValue({ title: 'Costco México', url: 'https://www3.costco.com.mx/facturacion' }),
    captureScreenshot: vi.fn().mockResolvedValue('C:\\temp\\costco.png'),
    extractVisibleElements: vi.fn().mockResolvedValue({
      fields: [
        { tag: 'input', name: 'ticket', label: 'Ticket' },
        { tag: 'input', name: 'monto', label: 'Total pagado' },
        { tag: 'input', name: 'rfc', label: 'RFC' },
      ],
      buttons: ['Continuar'], headings: ['Generación'], statusMessages: [],
      captchaDetected: false, loginDetected: false, legalMessages: [],
    }),
    fillField: vi.fn().mockResolvedValue(undefined),
    interactWithField: vi.fn().mockResolvedValue(undefined),
    clickAction: vi.fn().mockResolvedValue({
      anchorTotalCount: 1, anchorVisibleCount: 1, formVisibleCount: 1,
      totalCount: 1, visibleCount: 1, containerSelector: 'form',
    }),
    observeAction: vi.fn(),
    waitForHttpResponse: vi.fn(() => input.validationResponse ?? Promise.resolve({ requestObserved: true, responseReceived: true, status: 200, durationMs: 25 })),
    waitForStageTransition: vi.fn().mockResolvedValue({ matchedFields: 1, expectedFields: 1, textMatched: false }),
    waitForSettled: vi.fn().mockResolvedValue(undefined),
  };
  const sessions = {
    create: vi.fn().mockResolvedValue({ id: 'portal-session' }), markRunning: vi.fn().mockResolvedValue(undefined),
    markNavigationCompleted: vi.fn().mockResolvedValue(undefined), markScreenshot: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined), fail: vi.fn().mockResolvedValue(undefined),
    markUnknownOutcome: vi.fn().mockResolvedValue(undefined),
  } as unknown as PortalSessionService;
  const config = new ConfigService({ PAE_ENABLED: String(input.enabled ?? true), PAE_SESSION_TIMEOUT_MS: String(input.timeoutMs ?? 60_000) });
  return { browser, sessions, service: new PortalProbeService(browser, sessions, new CostcoInvoiceReadOnlyAdapter(), config) };
}

describe('Portal Automation Engine Costco probe', () => {
  it('declares email delivery with a 72-hour window and both expected CFDI documents', () => {
    expect(new CostcoInvoiceReadOnlyAdapter().getPendingDocumentPolicy()).toMatchObject({
      strategy: 'EMAIL_DELIVERY', windowMs: 72 * 60 * 60 * 1000,
      expectedDocumentTypes: ['XML', 'PDF'],
    });
  });
  it('allows Costco HTTPS domains and blocks other domains or protocols', () => {
    expect(isAllowedPortalUrl('https://www3.costco.com.mx/facturacion', ['costco.com.mx'])).toBe(true);
    expect(isAllowedPortalUrl('https://evil.example/facturacion', ['costco.com.mx'])).toBe(false);
    expect(isAllowedPortalUrl('http://www3.costco.com.mx/facturacion', ['costco.com.mx'])).toBe(false);
  });

  it('lets each adapter declare its own portal-ready selector', () => {
    const costco = new CostcoInvoiceReadOnlyAdapter();
    const secondAdapter = { getReadySelector: () => '#different-portal-ready' };
    expect(costco.getReadySelector()).toBe('input[name="ticket"]');
    expect(secondAdapter.getReadySelector()).toBe('#different-portal-ready');
  });

  it('waits for the adapter selector after navigation without a generic first control', async () => {
    const { service, browser } = harness();
    await service.probeCostco('workspace-id');
    expect(browser.waitForPortalReady).toHaveBeenCalledWith(browserSession, 'input[name="ticket"]', 60_000);
    expect(vi.mocked(browser.navigate).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(browser.waitForPortalReady).mock.invocationCallOrder[0]!);
    const providerSource = readFileSync(join(__dirname, 'playwright-browser.provider.ts'), 'utf8');
    const readyMethod = providerSource.slice(providerSource.indexOf('async waitForPortalReady'), providerSource.indexOf('async getPageMetadata'));
    expect(readyMethod).not.toContain('.first()');
    expect(readyMethod).not.toContain('.catch(');
  });

  it('propagates the original portal-ready TimeoutError', async () => {
    const original = Object.assign(new Error('locator.waitFor: Timeout 60000ms exceeded'), { name: 'TimeoutError' });
    const { service, browser } = harness();
    vi.mocked(browser.waitForPortalReady).mockRejectedValue(original);
    await expect(service.probeCostco('workspace-id')).rejects.toBe(original);
  });

  it('returns the structured result and completes the persisted session', async () => {
    const { service, browser, sessions } = harness();
    const result = await service.probeCostco('workspace-id');
    expect(result).toMatchObject({ success: true, portalSessionId: 'portal-session', adapterKey: 'COSTCO_INVOICE_READ_ONLY', pageTitle: 'Costco México', captchaDetected: false, loginDetected: false });
    expect(result.visibleFields).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'ticket' })]));
    expect(sessions.complete).toHaveBeenCalledOnce();
    expect(sessions.fail).not.toHaveBeenCalled();
    expect(browser.closeSession).toHaveBeenCalledWith(browserSession);
  });

  it('does not expose any form action or irreversible browser method', async () => {
    const { service, browser } = harness();
    await service.probeCostco('workspace-id');
    expect(Object.keys(browser).sort()).toEqual([
      'captureScreenshot', 'clickAction', 'closeSession', 'createSession', 'extractVisibleElements',
      'fillField', 'getPageMetadata', 'interactWithField', 'navigate', 'observeAction', 'waitForHttpResponse',
      'waitForPortalReady', 'waitForSettled', 'waitForStageTransition',
    ]);
  });

  it('honors the kill switch and persists failure', async () => {
    const { service, browser, sessions } = harness({ enabled: false });
    await expect(service.probeCostco('workspace-id')).rejects.toMatchObject({ code: 'PAE_DISABLED' });
    expect(browser.createSession).not.toHaveBeenCalled();
    expect(sessions.fail).toHaveBeenCalledWith('portal-session', 'PAE_DISABLED', expect.any(String));
  });

  it('times out, fails the session, and still closes the browser', async () => {
    const { service, browser, sessions } = harness({ navigateDelayMs: 30, timeoutMs: 5 });
    await expect(service.probeCostco('workspace-id')).rejects.toMatchObject({ name: 'TimeoutError', message: 'Session timeout' });
    expect(sessions.fail).toHaveBeenCalledWith('portal-session', 'SESSION_TIMEOUT', expect.any(String));
    expect(browser.closeSession).toHaveBeenCalledOnce();
  });

  it('retries navigation once and records final failure', async () => {
    const { service, browser, sessions } = harness({ navigateError: new Error('network unavailable') });
    await expect(service.probeCostco('workspace-id')).rejects.toMatchObject({ code: 'NAVIGATION_FAILED' });
    expect(browser.navigate).toHaveBeenCalledTimes(2);
    expect(sessions.fail).toHaveBeenCalledWith('portal-session', 'NAVIGATION_FAILED', expect.any(String));
    expect(browser.closeSession).toHaveBeenCalledOnce();
  });

  it('fills only the three initial fields and clicks Continue exactly once', async () => {
    const { service, browser, sessions } = harness();
    const result = await service.probeCostcoInitialValidation('workspace-id', {
      ticketOrOrder: 'sensitive-ticket', totalPaid: '100.00', rfc: 'sensitive-rfc',
    });
    expect(browser.fillField).toHaveBeenCalledTimes(3);
    expect(browser.fillField).toHaveBeenNthCalledWith(1, browserSession, 'ticket', 'sensitive-ticket');
    expect(browser.fillField).toHaveBeenNthCalledWith(2, browserSession, 'monto', '100.00');
    expect(browser.fillField).toHaveBeenNthCalledWith(3, browserSession, 'rfc', 'sensitive-rfc');
    expect(browser.clickAction).toHaveBeenCalledOnce();
    expect(vi.mocked(browser.waitForHttpResponse).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(browser.clickAction).mock.invocationCallOrder[0]!);
    expect(browser.clickAction).toHaveBeenCalledWith(
      browserSession,
      {
        anchorLabel: 'Ticket / Orden', anchorInputSelector: 'input[name="ticket"]',
        containerSelector: 'form', expectedVisibleCount: 1,
      },
      { css: 'button#btnEnviar.basic-button', text: 'Continuar', visibleOnly: true, expectedCount: 1 },
    );
    expect(result.actionResolution).toEqual({
      anchorTotalCount: 1, anchorVisibleCount: 1, formVisibleCount: 1,
      totalCount: 1, visibleCount: 1, containerSelector: 'form',
    });
    expect(JSON.stringify(result)).not.toContain('sensitive-ticket');
    expect(JSON.stringify(result)).not.toContain('sensitive-rfc');
    expect(sessions.complete).toHaveBeenCalledOnce();
    expect(browser.closeSession).toHaveBeenCalledOnce();
  });

  it('does not close the browser while the validation response is pending', async () => {
    let resolveResponse!: (result: ObservedHttpResponse) => void;
    const validationResponse = new Promise<ObservedHttpResponse>((resolve) => { resolveResponse = resolve; });
    const { service, browser } = harness({ validationResponse });
    const execution = service.probeCostcoInitialValidation('workspace-id', {
      ticketOrOrder: 'ticket', totalPaid: '100.00', rfc: 'rfc',
    });
    await vi.waitFor(() => expect(browser.clickAction).toHaveBeenCalledOnce());
    expect(browser.closeSession).not.toHaveBeenCalled();
    resolveResponse({ requestObserved: true, responseReceived: true, status: 201, durationMs: 20 });
    await execution;
    expect(browser.closeSession).toHaveBeenCalledOnce();
  });

  it('persists UNKNOWN_OUTCOME after the response observer times out', async () => {
    const validationResponse = Promise.resolve({ requestObserved: true, responseReceived: false, status: null, durationMs: null });
    const { service, sessions } = harness({ validationResponse });
    await service.probeCostcoInitialValidation('workspace-id', {
      ticketOrOrder: 'ticket', totalPaid: '100.00', rfc: 'rfc',
    });
    expect(sessions.markUnknownOutcome).toHaveBeenCalledWith('portal-session', 'VALIDATION_RESPONSE_TIMEOUT');
    expect(sessions.complete).not.toHaveBeenCalled();
  });

  it('encapsulates the Playwright import in PlaywrightBrowserProvider only', () => {
    const offenders = readdirSync(__dirname)
      .filter((file) => file.endsWith('.ts') && file !== 'playwright-browser.provider.ts')
      .filter((file) => /from ['"]playwright['"]/.test(readFileSync(join(__dirname, file), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('resolves the form containing the ticket anchor and its single Continue action', () => {
    const adapter = new CostcoInvoiceReadOnlyAdapter();
    expect(() => assertFormAndActionResolution(
      adapter.getFormLocator(), adapter.getActionLocator('CONTINUE'),
      { anchorTotalCount: 1, anchorVisibleCount: 1, formVisibleCount: 1, totalCount: 1, visibleCount: 1 },
    )).not.toThrow();
    expect(adapter.getFormLocator()).toEqual({
      anchorLabel: 'Ticket / Orden', anchorInputSelector: 'input[name="ticket"]',
      containerSelector: 'form', expectedVisibleCount: 1,
    });
    expect(adapter.getActionLocator('CONTINUE')).toMatchObject({ text: 'Continuar' });
  });

  it('ignores a Solicitar button outside the anchored form', () => {
    const adapter = new CostcoInvoiceReadOnlyAdapter();
    expect(adapter.getFormLocator().anchorInputSelector).toBe('input[name="ticket"]');
    expect(adapter.getActionLocator('CONTINUE').text).toBe('Continuar');
  });

  it('rejects two visible forms with the same anchor', () => {
    const adapter = new CostcoInvoiceReadOnlyAdapter();
    expect(() => assertFormAndActionResolution(
      adapter.getFormLocator(), adapter.getActionLocator('CONTINUE'),
      { anchorTotalCount: 2, anchorVisibleCount: 2, formVisibleCount: 0, totalCount: 0, visibleCount: 0 },
    )).toThrow(FormOrActionAmbiguousError);
  });

  it('rejects an absent anchor field', () => {
    const adapter = new CostcoInvoiceReadOnlyAdapter();
    expect(() => assertFormAndActionResolution(
      adapter.getFormLocator(), adapter.getActionLocator('CONTINUE'),
      { anchorTotalCount: 0, anchorVisibleCount: 0, formVisibleCount: 0, totalCount: 0, visibleCount: 0 },
    )).toThrowError(/FORM_OR_ACTION_AMBIGUOUS/);
  });

  it('supports a second adapter action strategy without changing the engine', () => {
    const secondAdapter = {
      getReadySelector: () => '#ready',
      getFormLocator: () => ({ anchorLabel: 'Reservation', anchorInputSelector: 'input[name="reservation"]', containerSelector: 'form', expectedVisibleCount: 1 }),
      getActionLocator: () => ({ role: 'button' as const, name: 'Submit', visibleOnly: true, expectedCount: 1 }),
    };
    expect(secondAdapter.getFormLocator()).toMatchObject({ anchorInputSelector: 'input[name="reservation"]', containerSelector: 'form' });
    expect(secondAdapter.getActionLocator()).toMatchObject({ role: 'button', name: 'Submit' });
  });

  it('does not resolve action ambiguity with first() or a navbar scope', () => {
    const providerSource = readFileSync(join(__dirname, 'playwright-browser.provider.ts'), 'utf8');
    const actionMethod = providerSource.slice(providerSource.indexOf('async clickAction'), providerSource.indexOf('waitForHttpResponse('));
    expect(actionMethod).not.toContain('.first()');
    expect(new CostcoInvoiceReadOnlyAdapter().getFormLocator().containerSelector).toBe('form');
    expect(actionMethod).toContain('ancestor::');
  });

  it('reproduces the observed Costco DOM and selects the nearest common form', () => {
    const observedDom = {
      tag: 'form', className: 'basic-form ng-untouched ng-pristine ng-invalid',
      children: [
        { tag: 'div', children: [{ tag: 'input', name: 'ticket' }] },
        { tag: 'button', id: 'btnEnviar', className: 'basic-button', text: 'Continuar', visible: true },
      ],
    };
    const adapter = new CostcoInvoiceReadOnlyAdapter();
    expect(observedDom.tag).toBe(adapter.getFormLocator().containerSelector);
    expect(observedDom.children.some((child) => child.tag === 'button' && child.text === 'Continuar')).toBe(true);
    expect(adapter.getActionLocator('CONTINUE')).toMatchObject({
      css: 'button#btnEnviar.basic-button', text: 'Continuar', expectedCount: 1,
    });
  });
});
