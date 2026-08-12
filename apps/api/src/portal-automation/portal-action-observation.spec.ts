import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CostcoInvoiceReadOnlyAdapter } from './costco-invoice-read-only.adapter';
import { classifyActionObservation, sanitizePortalDiagnostic } from './playwright-browser.provider';

const base = {
  transitionVisible: false,
  requestFailed: false,
  pageError: false,
  visibleError: false,
  responseGraceElapsed: false,
  timedOut: false,
  expectedRequest: true,
  requestObserved: true,
};

describe('portal post-action observation', () => {
  it('resolves an observed successful response with a visible stage transition', () => {
    expect(classifyActionObservation({ ...base, responseStatus: 200, transitionVisible: true })).toBe('STAGE_TRANSITION');
  });

  it('resolves a rejected action response without waiting for the full timeout', () => {
    expect(classifyActionObservation({ ...base, responseStatus: 459, successStatuses: [200, 201] })).toBe('ACTION_RESPONSE_REJECTED');
  });

  it('reports when the expected request was not observed', () => {
    expect(classifyActionObservation({ ...base, requestObserved: false, timedOut: true })).toBe('EXPECTED_ACTION_REQUEST_NOT_OBSERVED');
  });

  it('reports a successful response whose next stage remains hidden', () => {
    expect(classifyActionObservation({ ...base, responseStatus: 200, responseGraceElapsed: true })).toBe('ACTION_RESPONSE_SUCCESS_BUT_STAGE_NOT_VISIBLE');
  });

  it('prioritizes request failures and page errors', () => {
    expect(classifyActionObservation({ ...base, requestFailed: true })).toBe('REQUEST_FAILED');
    expect(classifyActionObservation({ ...base, pageError: true })).toBe('PAGE_ERROR');
  });

  it('reports a timeout after an observed request with no response', () => {
    expect(classifyActionObservation({ ...base, timedOut: true })).toBe('TIMEOUT');
  });

  it('sanitizes RFCs, long numbers and secrets', () => {
    const sanitized = sanitizePortalDiagnostic('RFC BELE880510NG3 ticket 71901102120708261246 token=secret-value');
    expect(sanitized).toBe('RFC [RFC] ticket [NUMBER] token=[REDACTED]');
  });

  it('declares Costco expected request in the adapter and installs listeners before clicking', () => {
    const stage = new CostcoInvoiceReadOnlyAdapter().getStages()[0];
    expect(stage?.expectedActionRequest).toEqual({
      method: 'POST', pathname: '/portales/invoice/validateCheck', successStatuses: [200, 201, 459],
    });
    const source = readFileSync(join(__dirname, 'playwright-browser.provider.ts'), 'utf8');
    expect(source.indexOf("page.on('request', onRequest)")).toBeLessThan(source.indexOf('this.clickAction(session, input.form, input.action)'));
  });
});
