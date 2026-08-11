import { describe, expect, it } from 'vitest';
import {
  EXPENSE_CORRECTION_NOT_ALLOWED_MESSAGE,
  isPublishedExpenseCorrection,
} from './expense-publication-policy';

describe('published expense policy', () => {
  it.each([
    'No fueron 300, fueron 250',
    'En realidad fueron 250',
    'No fue efectivo, fue crédito',
    'No lo hizo JZM, lo hizo Ana',
    'No era gasolina, era estacionamiento',
  ])('detects a forbidden correction: %s', (text) => {
    expect(isPublishedExpenseCorrection(text)).toBe(true);
  });

  it('does not classify cancellation or a new expense as correction', () => {
    expect(isPublishedExpenseCorrection('Cancela el último gasto')).toBe(false);
    expect(isPublishedExpenseCorrection('Gasté 250 en estacionamiento')).toBe(false);
  });

  it('uses the exact product policy response', () => {
    expect(EXPENSE_CORRECTION_NOT_ALLOWED_MESSAGE).toBe(
      'No puedo modificar un gasto ya registrado. Debes cancelarlo y registrar uno nuevo.',
    );
  });
});
