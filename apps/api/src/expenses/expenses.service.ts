import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountRole, ExpenseStatus, type Expense } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { ExpenseCancellationCriteria } from './expense-cancellation-parser';

export type ExpenseCancellationStartResult =
  | {
      readonly status: 'CANCELLATION_REQUESTED';
      readonly message: 'Solicité autorización para cancelar este gasto.';
    }
  | {
      readonly status: 'NEEDS_CANCELLATION_REASON';
      readonly message: '¿Cuál es el motivo de la cancelación?';
      readonly expenseId: string;
    }
  | {
      readonly status: 'CANCELLATION_SELECTION_REQUIRED';
      readonly message: '¿Cuál gasto quieres cancelar?';
      readonly candidates: readonly ExpenseCancellationCandidate[];
    };

export interface ExpenseCancellationCandidate {
  readonly expenseId: string;
  readonly label: string;
  readonly amount: string;
  readonly currency: string;
  readonly spenderName: string;
  readonly occurredAt: string;
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(workspaceId: string, expenseId: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id: expenseId, workspaceId } });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async getBySourceEventId(sourceEventId: string) {
    return this.prisma.expense.findUniqueOrThrow({
      where: { sourceEventId },
      include: {
        paymentInstrument: { select: { name: true } },
        budgetAssignment: {
          select: { status: true, budget: { select: { name: true } } },
        },
      },
    });
  }

  async linkToConversation(workspaceId: string, expenseId: string, externalChatId: string): Promise<void> {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    await this.prisma.auditEvent.create({ data: {
      accountId: workspace.accountId,
      action: 'EXPENSE_CHAT_LINKED',
      entityType: 'Expense',
      entityId: expenseId,
      metadata: { workspaceId, externalChatId },
    } });
  }

  async startLastExpenseCancellation(input: {
    workspaceId: string;
    externalChatId: string;
    actorUserId: string;
    criteria?: ExpenseCancellationCriteria;
  }): Promise<ExpenseCancellationStartResult> {
    const candidates = await this.findConversationExpenses(
      input.workspaceId,
      input.externalChatId,
      input.criteria,
    );
    if (candidates.length !== 1) {
      return {
        status: 'CANCELLATION_SELECTION_REQUIRED',
        message: '¿Cuál gasto quieres cancelar?',
        candidates: await this.recentCancellationCandidates(
          input.workspaceId,
          input.externalChatId,
        ),
      };
    }
    return this.beginCancellation(
      candidates[0]!,
      input.workspaceId,
      input.actorUserId,
    );
  }

  async startSelectedExpenseCancellation(input: {
    workspaceId: string;
    expenseId: string;
    actorUserId: string;
  }): Promise<Exclude<ExpenseCancellationStartResult, {
    readonly status: 'CANCELLATION_SELECTION_REQUIRED';
  }>> {
    const expense = await this.prisma.expense.findFirstOrThrow({
      where: {
        id: input.expenseId,
        workspaceId: input.workspaceId,
        status: ExpenseStatus.REGISTERED,
      },
    });
    return this.beginCancellation(expense, input.workspaceId, input.actorUserId);
  }

  private async beginCancellation(
    expense: Expense,
    workspaceId: string,
    actorUserId: string,
  ): Promise<Exclude<ExpenseCancellationStartResult, {
    readonly status: 'CANCELLATION_SELECTION_REQUIRED';
  }>> {
    const permission = await this.cancellationPermission(workspaceId, actorUserId);
    if (!permission.allowed) {
      await this.prisma.auditEvent.create({ data: {
        accountId: permission.accountId,
        actorUserId,
        action: 'EXPENSE_CANCELLATION_REQUESTED',
        entityType: 'Expense',
        entityId: expense.id,
        metadata: {
          previousStatus: expense.status,
          requestedStatus: ExpenseStatus.CANCELLED,
          userId: actorUserId,
        },
      } });
      return {
        status: 'CANCELLATION_REQUESTED',
        message: 'Solicité autorización para cancelar este gasto.',
      };
    }
    return {
      status: 'NEEDS_CANCELLATION_REASON',
      message: '¿Cuál es el motivo de la cancelación?',
      expenseId: expense.id,
    };
  }

  private async recentCancellationCandidates(
    workspaceId: string,
    externalChatId: string,
  ): Promise<readonly ExpenseCancellationCandidate[]> {
    const expenses = await this.prisma.expense.findMany({
      where: { workspaceId, status: ExpenseStatus.REGISTERED },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    const prioritized = [
      ...expenses.filter((expense) => expense.sourceConversationId === externalChatId),
      ...expenses.filter((expense) => expense.sourceConversationId !== externalChatId),
    ].slice(0, 5);
    return prioritized.map((expense) => ({
      expenseId: expense.id,
      label: expense.description?.trim() || expense.merchantName,
      amount: expense.originalAmount.toString(),
      currency: expense.originalCurrency,
      spenderName: expense.spenderName,
      occurredAt: expense.occurredAt.toISOString(),
    }));
  }

  async cancelExpense(input: {
    workspaceId: string;
    expenseId: string;
    externalChatId: string;
    actorUserId: string;
    reason: string;
    now?: Date;
  }): Promise<{ readonly status: 'CANCELLED'; readonly message: '✅ Gasto cancelado.'; readonly expense: Expense }> {
    const reason = input.reason.trim();
    if (!reason) throw new ConflictException('Cancellation reason is required');
    const permission = await this.cancellationPermission(input.workspaceId, input.actorUserId);
    if (!permission.allowed) throw new ConflictException('Expense cancellation requires authorization');
    const current = await this.prisma.expense.findFirstOrThrow({
      where: { id: input.expenseId, workspaceId: input.workspaceId },
    });
    if (current.status !== ExpenseStatus.REGISTERED) throw new ConflictException('Expense is not active');
    const now = input.now ?? new Date();
    const expense = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id: current.id },
        data: {
          status: ExpenseStatus.CANCELLED,
          cancelledAt: now,
          cancelledByUserId: input.actorUserId,
          cancellationReason: reason,
        },
      });
      await tx.auditEvent.create({ data: {
        accountId: permission.accountId,
        actorUserId: input.actorUserId,
        action: 'EXPENSE_CANCELLED',
        entityType: 'Expense',
        entityId: current.id,
        metadata: {
          previousStatus: current.status,
          newStatus: ExpenseStatus.CANCELLED,
          userId: input.actorUserId,
          reason,
          date: now.toISOString(),
        },
      } });
      return updated;
    });
    return { status: 'CANCELLED', message: '✅ Gasto cancelado.', expense };
  }

  private async findConversationExpenses(
    workspaceId: string,
    externalChatId: string,
    criteria?: ExpenseCancellationCriteria,
  ): Promise<Expense[]> {
    if (!criteria || Object.keys(criteria).length === 0) {
      const expense = await this.prisma.expense.findFirst({
        where: {
          workspaceId,
          sourceConversationId: externalChatId,
          status: ExpenseStatus.REGISTERED,
        },
        orderBy: { createdAt: 'desc' },
      });
      return expense ? [expense] : [];
    }
    const expenses = await this.prisma.expense.findMany({
      where: {
        workspaceId,
        status: ExpenseStatus.REGISTERED,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const matches = expenses.filter((expense) => {
      if (criteria.amount && Number(expense.originalAmount) !== Number(criteria.amount)) return false;
      if (criteria.paymentMethod && expense.paymentMethod !== criteria.paymentMethod) return false;
      if (criteria.spenderName &&
        !this.normalizedText(expense.spenderName).includes(
          this.normalizedText(criteria.spenderName),
        )) return false;
      if (criteria.occurredOn && expense.occurredAt.toISOString().slice(0, 10) !== criteria.occurredOn) {
        return false;
      }
      if (criteria.query) {
        const searchable = [
          expense.merchantName,
          expense.description,
          expense.category,
        ].filter((value): value is string => Boolean(value)).join(' ');
        if (!this.matchesCancellationText(criteria.query, searchable)) return false;
      }
      return true;
    });
    const sameConversation = matches.filter(
      (expense) => expense.sourceConversationId === externalChatId,
    );
    return sameConversation.length > 0 ? sameConversation : matches;
  }

  private matchesCancellationText(query: string, searchable: string): boolean {
    const requested = this.normalizedText(query);
    const candidate = this.normalizedText(searchable);
    if (candidate.includes(requested)) return true;
    const candidateTokens = candidate.split(' ').filter(Boolean);
    return requested.split(' ').filter(Boolean).every((token) => {
      const equivalents = token === 'comida'
        ? ['comida', 'alimento']
        : token.startsWith('alimento')
          ? ['alimento', 'comida']
          : [token];
      return equivalents.some((equivalent) =>
        candidateTokens.some((candidateToken) =>
          candidateToken.includes(equivalent) || equivalent.includes(candidateToken),
        ),
      );
    });
  }

  private normalizedText(value: string): string {
    return value.normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, ' ')
      .trim();
  }

  private async cancellationPermission(workspaceId: string, actorUserId: string): Promise<{
    readonly allowed: boolean;
    readonly accountId: string;
  }> {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId }, select: { accountId: true },
    });
    const membership = await this.prisma.accountMember.findFirst({
      where: { accountId: workspace.accountId, userId: actorUserId, deletedAt: null },
      select: { role: true, user: { select: { platformRole: true } } },
    });
    const administrator = membership?.user.platformRole === null && (
      membership.role === AccountRole.ACCOUNT_OWNER ||
      membership.role === AccountRole.ACCOUNT_ADMIN
    );
    return { allowed: administrator, accountId: workspace.accountId };
  }
}
