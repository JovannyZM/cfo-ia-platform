import {
  ExpenseBudgetAssignedBy,
  ExpenseBudgetAssignmentStatus,
  ExpenseStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma.service';
import type { BudgetClassifierService } from './budget-classifier.service';
import { ExpenseBudgetAssignmentService } from './expense-budget-assignment.service';

const expense = {
  id: 'expense-id',
  workspaceId: 'workspace-id',
  status: ExpenseStatus.REGISTERED,
  merchantName: 'CFE',
  description: 'Servicio de luz',
  category: 'Servicios',
  workspace: { accountId: 'account-id' },
};

function setup(classification: Record<string, unknown>, existing: unknown = null) {
  const assignmentCreate = vi.fn().mockImplementation(({ data }) => ({ id: 'assignment-id', ...data }));
  const auditCreate = vi.fn().mockResolvedValue({ id: 'audit-id' });
  const findUnique = vi.fn().mockResolvedValue(existing);
  const expenseFindFirst = vi.fn().mockResolvedValue(expense);
  const tx = { expenseBudgetAssignment: { create: assignmentCreate }, auditEvent: { create: auditCreate } };
  const prisma = {
    expenseBudgetAssignment: { findUnique, findUniqueOrThrow: vi.fn() },
    expense: { findFirst: expenseFindFirst },
    $transaction: vi.fn((callback) => callback(tx)),
  } as unknown as PrismaService;
  const classify = vi.fn().mockResolvedValue(classification);
  const classifier = { classify } as unknown as BudgetClassifierService;
  return {
    service: new ExpenseBudgetAssignmentService(prisma, classifier),
    prisma,
    classifier,
    classify,
    expenseFindFirst,
    assignmentCreate,
    auditCreate,
  };
}

const assigned = {
  budgetId: 'budget-id',
  confidence: 0.85,
  matchedRule: { id: 'rule-id', ruleType: 'MERCHANT_NAME', value: 'CFE' },
  reason: 'Coincidió el comercio o proveedor.',
  ambiguous: false,
};

describe('ExpenseBudgetAssignmentService', () => {
  it('persists one auditable ASSIGNED result for a new registered expense', async () => {
    const context = setup(assigned);
    const result = await context.service.assign('expense-id', 'workspace-id');
    expect(result).toMatchObject({
      status: ExpenseBudgetAssignmentStatus.ASSIGNED,
      budgetId: 'budget-id',
      matchedRuleId: 'rule-id',
      assignedBy: ExpenseBudgetAssignedBy.RULE,
    });
    expect(context.auditCreate).toHaveBeenCalledOnce();
  });

  it('gives an explicit user budget priority and records its origin', async () => {
    const context = setup({
      ...assigned,
      confidence: 1,
      matchedRule: { id: null, ruleType: 'EXPLICIT_BUDGET', value: 'Luz' },
      reason: 'El usuario indicó explícitamente el presupuesto.',
    });
    const result = await context.service.assign('expense-id', 'workspace-id', 'Luz');
    expect(result).toMatchObject({
      status: ExpenseBudgetAssignmentStatus.ASSIGNED,
      assignedBy: ExpenseBudgetAssignedBy.EXPLICIT_USER,
      matchedRuleId: null,
    });
    expect(context.classify).toHaveBeenCalledWith(
      'workspace-id', expect.objectContaining({ explicitBudgetName: 'Luz' }),
    );
  });

  it.each([
    [true, ExpenseBudgetAssignmentStatus.AMBIGUOUS],
    [false, ExpenseBudgetAssignmentStatus.UNMATCHED],
  ])('persists a result without choosing a budget when ambiguous=%s', async (ambiguous, status) => {
    const context = setup({
      budgetId: null, confidence: 0, matchedRule: null, reason: 'Sin selección', ambiguous,
    });
    expect(await context.service.assign('expense-id', 'workspace-id')).toMatchObject({
      status, budgetId: null, matchedRuleId: null,
    });
  });

  it('is idempotent by expenseId and does not classify twice', async () => {
    const existing = { id: 'existing-assignment', expenseId: 'expense-id' };
    const context = setup(assigned, existing);
    expect(await context.service.assign('expense-id', 'workspace-id')).toBe(existing);
    expect(context.classify).not.toHaveBeenCalled();
    expect(context.assignmentCreate).not.toHaveBeenCalled();
  });

  it('ignores CANCELLED expenses', async () => {
    const context = setup(assigned);
    context.expenseFindFirst.mockResolvedValue(null);
    expect(await context.service.assign('expense-id', 'workspace-id')).toBeNull();
    expect(context.classify).not.toHaveBeenCalled();
    expect(context.assignmentCreate).not.toHaveBeenCalled();
    expect(context.expenseFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: ExpenseStatus.REGISTERED }),
    }));
  });
});
