import { describe, expect, it } from 'vitest';
import { canTransitionInvoiceRequest } from './invoice-request';

describe('InvoiceRequest transitions', () => {
  it('allows the valid lifecycle', () => {
    expect(canTransitionInvoiceRequest('PENDING', 'READY')).toBe(true);
    expect(canTransitionInvoiceRequest('READY', 'PROCESSING')).toBe(true);
    expect(canTransitionInvoiceRequest('PROCESSING', 'COMPLETED')).toBe(true);
    expect(canTransitionInvoiceRequest('PROCESSING', 'FAILED')).toBe(true);
  });

  it('rejects changes after completion', () => {
    expect(canTransitionInvoiceRequest('COMPLETED', 'PROCESSING')).toBe(false);
  });
});
