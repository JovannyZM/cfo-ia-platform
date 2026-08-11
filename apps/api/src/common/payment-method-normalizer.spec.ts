import { describe, expect, it } from 'vitest';
import { normalizePaymentMethodText } from './payment-method-normalizer';

describe('normalizePaymentMethodText', () => {
  it.each([
    ['ejectivo', 'efectivo'],
    ['efetivo', 'efectivo'],
    ['eftivo', 'efectivo'],
    ['deboto', 'débito'],
    ['debito', 'débito'],
    ['credito', 'crédito'],
    ['trasferencia', 'transferencia'],
    ['transferensia', 'transferencia'],
    ['TARJETA', 'tarjeta'],
    ['  Cheque  ', 'cheque'],
  ])('normalizes %s deterministically', (input, expected) => {
    expect(normalizePaymentMethodText(input).text).toBe(expected);
  });

  it('normalizes variants inside a sentence', () => {
    expect(normalizePaymentMethodText('Pagué 850 en EJECTIVO').text).toBe(
      'Pagué 850 en efectivo',
    );
  });
});
