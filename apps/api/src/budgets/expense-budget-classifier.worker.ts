import {
  EXPENSE_REGISTERED,
  type DomainEvent,
  type ExpenseRegisteredPayload,
  type Worker,
} from '@cfo-ia/domain';
import { Injectable } from '@nestjs/common';
import { WorkerRegistry } from '../workers/worker-registry';
import { ExpenseBudgetAssignmentService } from './expense-budget-assignment.service';

@Injectable()
export class ExpenseBudgetClassifierWorker implements Worker {
  readonly id = 'expense-budget-classifier';
  readonly name = 'Clasificador de Presupuestos';
  readonly description = 'Clasifica gastos registrados sin modificarlos';
  readonly version = '1.0.0';
  readonly listensTo = [EXPENSE_REGISTERED] as const;
  readonly emits = [] as const;

  constructor(
    private readonly assignments: ExpenseBudgetAssignmentService,
    registry: WorkerRegistry,
  ) {
    registry.register(this);
  }

  canHandle(event: DomainEvent): boolean {
    return event.type === EXPENSE_REGISTERED;
  }

  async execute(event: DomainEvent): Promise<readonly DomainEvent[]> {
    const payload = event.payload as ExpenseRegisteredPayload;
    await this.assignments.assign(payload.expenseId, event.workspaceId, payload.explicitBudgetName);
    return [];
  }
}
