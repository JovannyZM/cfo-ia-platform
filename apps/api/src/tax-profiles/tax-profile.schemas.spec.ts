import { describe, expect, it } from 'vitest';
import { createTaxProfileSchema, mexicanRfcSchema } from './tax-profile.schemas';

describe('TaxProfile fiscal validation', () => {
  it.each(['GODE561231GR8', 'XAXX010101000'])('accepts valid RFC %s', (rfc) => expect(mexicanRfcSchema.parse(rfc)).toBe(rfc));
  it.each(['INVALID', 'GODE561332GR8', 'AB010101AAA'])('rejects invalid RFC %s', (rfc) => expect(() => mexicanRfcSchema.parse(rfc)).toThrow());
  it('validates postal code and email', () => {
    const base = { rfc: 'GODE561231GR8', legalName: 'Persona' };
    expect(() => createTaxProfileSchema.parse({ ...base, postalCode: '1234' })).toThrow();
    expect(() => createTaxProfileSchema.parse({ ...base, billingEmail: 'invalid' })).toThrow();
    expect(createTaxProfileSchema.parse({ ...base, postalCode: '01234', billingEmail: 'FACTURAS@EXAMPLE.COM' })).toMatchObject({ billingEmail: 'facturas@example.com' });
  });
});
