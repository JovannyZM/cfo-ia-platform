import { describe, expect, it } from 'vitest';
import { isNewExpenseIntent, stripNewExpenseOperation } from './new-expense-intent';

describe('NEW_EXPENSE intent', () => {
  it.each([
    'gast\u00e9', 'gasto', 'pagu\u00e9', 'pague', 'compr\u00e9', 'compre', 'pagamos', 'compramos',
    'pag\u00f3', 'pago', 'liquid\u00e9', 'liquide', 'abon\u00e9', 'abone', 'transfer\u00ed', 'transferi',
    'deposit\u00e9', 'deposite',
  ])('recognizes %s as a natural expense operation', (verb) => {
    expect(isNewExpenseIntent(`${verb}  369, a la maestra.`)).toBe(true);
  });

  it('is case, accent, spacing and punctuation insensitive', () => {
    expect(isNewExpenseIntent('  \u00a1PAGU\u00c9!   369 a la maestra.')).toBe(true);
    expect(stripNewExpenseOperation('Pagu\u00e9:  369 a la maestra.')).toBe('369 a la maestra.');
  });

  it('does not detect a verb embedded in another word', () => {
    expect(isNewExpenseIntent('repague 369')).toBe(false);
  });
});
