import { describe, expect, it } from 'vitest';
import { findPaymentInstrumentByAlias } from './payment-instrument-alias';

const instrument = {
  id: 'instrument-id',
  type: 'CREDIT_CARD',
  name: 'AMEX Aerom\u00e9xico Platinum',
  last4: null,
  holderName: 'Esli',
  aliases: ['amex', 'american express', 'amex platinum', 'aeromexico platinum'],
};

describe('findPaymentInstrumentByAlias', () => {
  it.each([
    'GastÃ© 500 con la AMEX',
    'GastÃ© 500 con Amex',
    'GastÃ© 500 con American Express',
    'GastÃ© 500 con Amex Platinum',
    'GastÃ© 500 con AEROM\u00c9XICO PLATINUM ',
  ])('matches aliases case/accent-insensitively: %s', (text) => {
    expect(findPaymentInstrumentByAlias(text, [instrument])).toEqual(instrument);
  });

  it('does not match an alias inside another word', () => {
    expect(findPaymentInstrumentByAlias('GastÃ© 500 en un examen', [instrument])).toBeUndefined();
  });
});
