import {
  EXPENSE_EVIDENCE_INTERPRETED,
  EXPENSE_REGISTERED,
  EXPENSE_INFORMATION_REQUIRED,
  EXPENSE_TEXT_RECEIVED,
  type ExpenseTextReceivedPayload,
  type DomainEvent,
  type ExpenseRegisteredPayload,
  type Worker,
} from '@cfo-ia/domain';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Expense, type Workspace } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { WorkerRegistry } from '../workers/worker-registry';
import { expenseEvidenceInterpretedSchema } from './expense.schemas';
import { requiresExpenseAmountConfirmation } from './expense-anomaly-policy';
import { parseExpenseText } from './expense-text-parser';
import {
  findPaymentInstrumentByAlias,
  paymentMethodFromInstrumentType,
  type AliasedPaymentInstrument,
} from './payment-instrument-alias';

@Injectable()
export class ExpenseAssistantWorker implements Worker {
  readonly id = 'expense-assistant';
  readonly name = 'Auxiliar de Gastos IA';
  readonly description = 'Registra gastos previamente interpretados';
  readonly version = '1.0.0';
  readonly listensTo = [EXPENSE_EVIDENCE_INTERPRETED, EXPENSE_TEXT_RECEIVED] as const;
  readonly emits = [EXPENSE_REGISTERED, EXPENSE_INFORMATION_REQUIRED] as const;

  constructor(
    private readonly prisma: PrismaService,
    workerRegistry: WorkerRegistry,
  ) {
    workerRegistry.register(this);
  }

  canHandle(event: DomainEvent): boolean {
    return event.type === EXPENSE_EVIDENCE_INTERPRETED || event.type === EXPENSE_TEXT_RECEIVED;
  }

  async execute(event: DomainEvent): Promise<readonly DomainEvent[]> {
    let candidate = event.type === EXPENSE_TEXT_RECEIVED
      ? parseExpenseText(event.payload as ExpenseTextReceivedPayload)
      : event.payload;
    let aliasInstrument: AliasedPaymentInstrument | undefined;
    if (event.type === EXPENSE_TEXT_RECEIVED) {
      const draft = candidate as Record<string, unknown>;
      const missingFields = [
        ...(!draft.merchantName ? ['merchantName' as const] : []),
        ...(!draft.originalAmount ? ['originalAmount' as const] : []),
      ];
      if (missingFields.length) {
        return [{
          eventId: randomUUID(),
          type: EXPENSE_INFORMATION_REQUIRED,
          workspaceId: event.workspaceId,
          createdAt: new Date(),
          payload: { missingFields, draft },
        }];
      }
      const preliminary = expenseEvidenceInterpretedSchema.parse(candidate);
      if (
        !preliminary.amountConfirmed &&
        requiresExpenseAmountConfirmation({
          concept: preliminary.merchantName,
          amount: preliminary.originalAmount,
          currency: preliminary.originalCurrency,
        })
      ) {
        return [{
          eventId: randomUUID(),
          type: EXPENSE_INFORMATION_REQUIRED,
          workspaceId: event.workspaceId,
          createdAt: new Date(),
          payload: { missingFields: ['amountConfirmation'], draft: preliminary },
        }];
      }
      const instruments = await this.prisma.paymentInstrument.findMany({
        where: { workspaceId: event.workspaceId, active: true, aliases: { isEmpty: false } },
        select: {
          id: true, type: true, name: true, last4: true, holderName: true, aliases: true,
        },
      });
      const textPayload = event.payload as ExpenseTextReceivedPayload;
      aliasInstrument = findPaymentInstrumentByAlias(textPayload.normalizedText, instruments);
      if (aliasInstrument) {
        const paymentMethod = paymentMethodFromInstrumentType(aliasInstrument.type);
        candidate = {
          ...draft,
          ...(paymentMethod ? { paymentMethod } : {}),
          ...(/CARD$/u.test(aliasInstrument.type) ? { paymentInstrumentType: 'CARD' } : {}),
          paymentInstrumentName: aliasInstrument.name,
          ...(aliasInstrument.last4 ? { paymentLast4: aliasInstrument.last4 } : {}),
          spenderName: aliasInstrument.holderName,
        };
      }
    }
    const payload = expenseEvidenceInterpretedSchema.parse(candidate);
    if (
      payload.inputSource === 'TEXT' &&
      !payload.amountConfirmed &&
      requiresExpenseAmountConfirmation({
        concept: payload.merchantName,
        amount: payload.originalAmount,
        currency: payload.originalCurrency,
      })
    ) {
      return [{
        eventId: randomUUID(),
        type: EXPENSE_INFORMATION_REQUIRED,
        workspaceId: event.workspaceId,
        createdAt: new Date(),
        payload: { missingFields: ['amountConfirmation'], draft: payload },
      }];
    }
    const existing = await this.prisma.expense.findUnique({
      where: { sourceEventId: event.eventId },
      include: { workspace: true },
    });
    if (existing) return [this.toRegisteredEvent(existing, existing.workspace)];

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: event.workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const instrumentType = payload.paymentInstrumentType ??
      (/^(?:CARD|CREDIT_CARD|DEBIT_CARD)$/u.test(payload.paymentMethod ?? '') ? 'CARD' : undefined);
    const instrument = aliasInstrument ?? (instrumentType && payload.paymentLast4
      ? await this.prisma.paymentInstrument.findUnique({
          where: {
            workspaceId_type_last4: {
              workspaceId: workspace.id,
              type: instrumentType,
              last4: payload.paymentLast4,
            },
          },
        })
      : null);
    const spenderName = payload.spenderName ?? instrument?.holderName;
    const missingFields = [
      ...(!payload.paymentMethod ? ['paymentMethod' as const] : []),
      ...(instrumentType && payload.paymentLast4 && !instrument &&
      (!spenderName || !payload.paymentInstrumentName)
        ? ['paymentInstrumentDetails' as const]
        : !spenderName
          ? ['spenderName' as const]
          : []),
    ];
    if (missingFields.length) {
      return [{
        eventId: randomUUID(),
        type: EXPENSE_INFORMATION_REQUIRED,
        workspaceId: workspace.id,
        createdAt: new Date(),
        payload: { missingFields, draft: payload },
      }];
    }

    const learnedInstrument = instrument ?? (instrumentType && payload.paymentLast4
      ? await this.prisma.paymentInstrument.upsert({
          where: { workspaceId_type_last4: {
            workspaceId: workspace.id,
            type: instrumentType,
            last4: payload.paymentLast4,
          } },
          create: {
            workspaceId: workspace.id,
            type: instrumentType,
            name: payload.paymentInstrumentName ??
              `${payload.paymentMethod} •••• ${payload.paymentLast4}`,
            last4: payload.paymentLast4,
            holderName: spenderName!,
          },
          update: { active: true },
        })
      : null);

    const exchangeRate =
      payload.originalCurrency === workspace.baseCurrency
        ? new Prisma.Decimal(1)
        : payload.exchangeRate
          ? new Prisma.Decimal(payload.exchangeRate)
          : null;
    if (!exchangeRate) {
      throw new BadRequestException('exchangeRate is required for foreign currency');
    }

    const originalAmount = new Prisma.Decimal(payload.originalAmount);
    const baseAmount = originalAmount.mul(exchangeRate).toDecimalPlaces(4);

    try {
      const expense = await this.prisma.$transaction(async (tx) => {
        const created = await tx.expense.create({
          data: {
            workspaceId: workspace.id,
            sourceEventId: event.eventId,
            sourceChannel: payload.sourceChannel ?? null,
            sourceConversationId: payload.sourceConversationId ?? null,
            evidenceSha256: payload.evidenceSha256 ?? null,
            merchantName: payload.merchantName,
            description: payload.description ?? null,
            occurredAt: new Date(payload.occurredAt),
            originalAmount,
            originalCurrency: payload.originalCurrency,
            exchangeRate,
            baseAmount,
            category: payload.category ?? null,
            paymentMethod: payload.paymentMethod ?? null,
            paymentLast4: payload.paymentLast4 ?? null,
            spenderName: spenderName!,
            paymentInstrumentId: learnedInstrument?.id ?? null,
          },
        });
        await tx.auditEvent.create({
          data: {
            accountId: workspace.accountId,
            action: 'EXPENSE_REGISTERED',
            entityType: 'Expense',
            entityId: created.id,
            metadata: { sourceEventId: event.eventId, workspaceId: workspace.id },
          },
        });
        return created;
      });
      return [this.toRegisteredEvent(
        expense,
        workspace,
        payload.explicitBudgetName,
        learnedInstrument?.name,
      )];
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        if (payload.evidenceSha256) {
          const duplicateEvidence = await this.prisma.expense.findUnique({
            where: {
              workspaceId_evidenceSha256: {
                workspaceId: workspace.id,
                evidenceSha256: payload.evidenceSha256,
              },
            },
            include: { workspace: true },
          });
          if (duplicateEvidence) {
            return [this.toRegisteredEvent(duplicateEvidence, duplicateEvidence.workspace)];
          }
        }
        const duplicate = await this.prisma.expense.findUniqueOrThrow({
          where: { sourceEventId: event.eventId },
          include: { workspace: true },
        });
        return [this.toRegisteredEvent(duplicate, duplicate.workspace)];
      }
      throw error;
    }
  }

  private toRegisteredEvent(
    expense: Expense,
    workspace: Workspace,
    explicitBudgetName?: string,
    paymentInstrumentName?: string,
  ): DomainEvent<ExpenseRegisteredPayload> {
    return {
      eventId: randomUUID(),
      type: EXPENSE_REGISTERED,
      workspaceId: workspace.id,
      createdAt: new Date(),
      payload: {
        expenseId: expense.id,
        merchantName: expense.merchantName,
        occurredAt: expense.occurredAt.toISOString(),
        originalAmount: expense.originalAmount.toString(),
        originalCurrency: expense.originalCurrency,
        exchangeRate: expense.exchangeRate.toString(),
        baseAmount: expense.baseAmount.toString(),
        baseCurrency: workspace.baseCurrency,
        status: 'REGISTERED',
        ...(expense.paymentMethod ? { paymentMethod: expense.paymentMethod } : {}),
        ...(expense.paymentLast4 ? { paymentLast4: expense.paymentLast4 } : {}),
        spenderName: expense.spenderName,
        ...(expense.paymentInstrumentId ? { paymentInstrumentId: expense.paymentInstrumentId } : {}),
        ...(paymentInstrumentName ? { paymentInstrumentName } : {}),
        ...(expense.sourceChannel ? { sourceChannel: expense.sourceChannel } : {}),
        ...(expense.sourceConversationId ? { sourceConversationId: expense.sourceConversationId } : {}),
        ...(explicitBudgetName ? { explicitBudgetName } : {}),
      },
    };
  }
}
