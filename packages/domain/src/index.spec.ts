import { describe, expect, it } from 'vitest';
import { canTransitionTaxProfileRequest, normalizeRfc } from './index';

describe('tax profile request rules', () => {
  it('only allows approval from review or awaiting payment', () => {
    expect(canTransitionTaxProfileRequest('SUBMITTED', 'APPROVED')).toBe(false);
    expect(canTransitionTaxProfileRequest('UNDER_REVIEW', 'APPROVED')).toBe(true);
    expect(canTransitionTaxProfileRequest('AWAITING_PAYMENT', 'APPROVED')).toBe(true);
    expect(canTransitionTaxProfileRequest('APPROVED', 'APPROVED')).toBe(false);
  });

  it('normalizes RFCs before persistence', () => {
    expect(normalizeRfc(' xaxx010101000 ')).toBe('XAXX010101000');
  });
});
