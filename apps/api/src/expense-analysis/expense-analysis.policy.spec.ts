import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { ExpenseAnalysisPolicy } from './expense-analysis.policy';

describe('ExpenseAnalysisPolicy', () => {
  const policy = new ExpenseAnalysisPolicy();

  it.each([
    ['79.9999', 'NORMAL'], ['80', 'ATTENTION'], ['99.9999', 'ATTENTION'],
    ['100', 'EXCEEDED'], ['110', 'EXCEEDED'], ['110.0001', 'CRITICAL'],
  ] as const)('classifies %s as %s', (value, expected) => {
    expect(policy.budgetStatus(new Prisma.Decimal(value))).toBe(expected);
  });

  it('applies CRITICAL > DATA_INCOMPLETE > ATTENTION > NORMAL priority', () => {
    expect(policy.status({ budgetStatuses: ['CRITICAL'], hasIncompleteData: true })).toBe('CRITICAL');
    expect(policy.status({ budgetStatuses: ['EXCEEDED'], hasIncompleteData: true })).toBe('DATA_INCOMPLETE');
    expect(policy.status({ budgetStatuses: ['ATTENTION'], hasIncompleteData: false })).toBe('ATTENTION');
    expect(policy.status({ budgetStatuses: ['EXCEEDED'], hasIncompleteData: false })).toBe('ATTENTION');
    expect(policy.status({ budgetStatuses: ['NORMAL'], hasIncompleteData: false })).toBe('NORMAL');
  });
});
