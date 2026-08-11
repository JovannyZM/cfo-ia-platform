import { describe, expect, it } from 'vitest';
import {
  isLastExpenseCancellation,
  parseExpenseCancellation,
} from './expense-cancellation-parser';

describe('isLastExpenseCancellation', () => {
  it.each([
    'Cancelar el último gasto.',
    'cancela el ultimo gasto',
    'Cancela ese gasto',
    'Anula el último gasto',
    'Ese gasto está mal, cancélalo',
    'Quiero cancelar el gasto anterior',
  ]) (
    'recognizes %s',
    (text) => expect(isLastExpenseCancellation(text)).toBe(true),
  );
  it.each(['Cancela la conversación', 'Corrige el último gasto', 'Cancelar']) (
    'does not match %s',
    (text) => expect(isLastExpenseCancellation(text)).toBe(false),
  );
});

describe('parseExpenseCancellation details', () => {
  it.each([
    [
      'cancela el gasto de comida de 450 de JZM',
      { query: 'comida', amount: '450', spenderName: 'jzm' },
    ],
    [
      'cancela el gasto de 450 por comida',
      { query: 'comida', amount: '450' },
    ],
    [
      'cancela la comida de 450',
      { query: 'comida', amount: '450' },
    ],
    [
      'anula el gasto de comida que hizo JZM',
      { query: 'comida', spenderName: 'jzm' },
    ],
    [
      'cancela el gasto de comida en efectivo',
      { query: 'comida', paymentMethod: 'CASH' },
    ],
    [
      'cancela el gasto de 450 que hizo JZM en efectivo',
      { amount: '450', spenderName: 'jzm', paymentMethod: 'CASH' },
    ],
    [
      'cancela el gasto de comida de 450de jzm que hixo en efectivo',
      { query: 'comida', amount: '450', spenderName: 'jzm', paymentMethod: 'CASH' },
    ],
  ])('extracts unordered criteria from %s', (text, expected) => {
    expect(parseExpenseCancellation(text)).toEqual(expected);
  });

  it('extracts concept, amount and spender', () => {
    expect(parseExpenseCancellation('Cancela el gasto de gasolina de 850 de JZM'))
      .toEqual({ query: 'gasolina', amount: '850', spenderName: 'jzm' });
  });

  it('extracts concept, amount and payment method', () => {
    expect(parseExpenseCancellation('Anula el estacionamiento de 300 pagado en efectivo'))
      .toEqual({ query: 'estacionamiento', amount: '300', paymentMethod: 'CASH' });
  });

  it('treats Costco as the merchant query, not the spender', () => {
    expect(parseExpenseCancellation('Cancela la compra de Costco por 598.20'))
      .toEqual({ query: 'costco', amount: '598.20' });
  });
});
