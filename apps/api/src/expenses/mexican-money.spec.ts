import { describe, expect, it } from 'vitest';
import { requiresExpenseAmountConfirmation } from './expense-anomaly-policy';
import { parseMexicanMoney } from './mexican-money';

describe('Mexican expense amounts', () => {
  it.each(['85000', '85,000', '85 000', '$85,000', '$85,000.00'])(
    'normalizes %s',
    (value) => expect(parseMexicanMoney(value)).toBe(value.endsWith('.00') ? '85000.00' : '85000'),
  );

  it('isolates the temporary gasoline anomaly rule', () => {
    expect(requiresExpenseAmountConfirmation({ concept: 'gasolina', amount: '85000', currency: 'MXN' })).toBe(true);
    expect(requiresExpenseAmountConfirmation({ concept: 'gasolina', amount: '10000', currency: 'MXN' })).toBe(false);
  });
});
