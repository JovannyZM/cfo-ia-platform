import { EXPENSE_REGISTERED, type DomainEvent } from '@cfo-ia/domain';
import { describe, expect, it, vi } from 'vitest';
import type { WorkerRegistry } from '../workers/worker-registry';
import type { ExpenseBudgetAssignmentService } from './expense-budget-assignment.service';
import { ExpenseBudgetClassifierWorker } from './expense-budget-classifier.worker';

describe('ExpenseBudgetClassifierWorker', () => {
  it('assigns ExpenseRegistered once and emits no analysis event', async () => {
    const assign = vi.fn().mockResolvedValue({ id: 'assignment-id' });
    const register = vi.fn();
    const worker = new ExpenseBudgetClassifierWorker(
      { assign } as unknown as ExpenseBudgetAssignmentService,
      { register } as unknown as WorkerRegistry,
    );
    const event: DomainEvent = {
      eventId: 'event-id',
      type: EXPENSE_REGISTERED,
      workspaceId: 'workspace-id',
      createdAt: new Date(),
      payload: { expenseId: 'expense-id', explicitBudgetName: 'Luz' },
    };
    expect(await worker.execute(event)).toEqual([]);
    expect(assign).toHaveBeenCalledWith('expense-id', 'workspace-id', 'Luz');
    expect(register).toHaveBeenCalledWith(worker);
  });
});
