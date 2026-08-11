import {
  EXPENSE_EVIDENCE_INTERPRETED,
  EXPENSE_INFORMATION_REQUIRED,
  EXPENSE_TEXT_RECEIVED,
  type ExpenseInformationRequiredPayload,
  type DomainEvent,
  type EventBus,
} from '@cfo-ia/domain';
import { Body, Controller, Get, HttpStatus, Inject, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AccountRole, ConversationIntentType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { LanguageNormalizer } from '../common/language-normalizer';
import { PrismaService } from '../prisma.service';
import { EVENT_BUS } from '../workers/workers.module';
import {
  expenseEvidenceInterpretedSchema,
  expenseTextSchema,
  type ExpenseEvidenceInterpretedDto,
  type ExpenseTextDto,
} from './expense.schemas';
import { ExpensesService } from './expenses.service';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { parseExpenseCancellation } from './expense-cancellation-parser';
import { ConversationSessionService } from '../conversations/conversation-session.service';
import {
  EXPENSE_CORRECTION_NOT_ALLOWED_MESSAGE,
  isPublishedExpenseCorrection,
} from './expense-publication-policy';

// Temporary controlled endpoint for exercising the event-driven expense flow.
@Controller('workspaces/:workspaceId/expenses')
export class ExpensesController {
  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly expenses: ExpensesService,
    private readonly languageNormalizer: LanguageNormalizer,
    private readonly prisma: PrismaService,
    private readonly conversationSessions: ConversationSessionService,
  ) {}

  @UseGuards(
    WorkspaceAccessGuard([
      AccountRole.ACCOUNT_OWNER,
      AccountRole.ACCOUNT_ADMIN,
      AccountRole.MEMBER,
    ]),
  )
  @Post('interpreted-evidence')
  async interpretEvidence(
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodValidationPipe(expenseEvidenceInterpretedSchema))
    body: ExpenseEvidenceInterpretedDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const eventId = randomUUID();
    const event: DomainEvent = {
      eventId,
      type: EXPENSE_EVIDENCE_INTERPRETED,
      workspaceId,
      payload: body,
      createdAt: new Date(),
      correlationId: eventId,
    };
    let required: ExpenseInformationRequiredPayload | undefined;
    const unsubscribe = this.eventBus.subscribe(EXPENSE_INFORMATION_REQUIRED, (result) => {
      if (result.correlationId === eventId) required = result.payload as ExpenseInformationRequiredPayload;
    });
    try {
      await this.eventBus.publish(event);
    } finally {
      unsubscribe();
    }
    if (required) {
      response.status(HttpStatus.ACCEPTED);
      return { status: 'NEEDS_INFORMATION', ...required };
    }
    return this.expenses.getBySourceEventId(eventId);
  }

  @UseGuards(
    WorkspaceAccessGuard([
      AccountRole.ACCOUNT_OWNER,
      AccountRole.ACCOUNT_ADMIN,
      AccountRole.MEMBER,
    ]),
  )
  @Post('text')
  async text(
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodValidationPipe(expenseTextSchema)) body: ExpenseTextDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const eventId = randomUUID();
    const sessionKey = body.conversationId && body.sourceChannel ? {
      workspaceId,
      sourceChannel: body.sourceChannel,
      sourceConversationId: body.conversationId,
      userId: request.user.id,
    } : undefined;
    const activeSession = sessionKey ? await this.conversationSessions.getActive(sessionKey) : null;
    const activeConversation = activeSession ?? (body.conversationId
      ? await this.prisma.expenseConversation.findUnique({
          where: { workspaceId_externalChatId: { workspaceId, externalChatId: body.conversationId } },
        })
      : null);
    const normalization = this.languageNormalizer.normalize(body.text, {
      activeExpenseConversation: Boolean(activeConversation),
    });
    const conversationDraft = activeConversation && 'draft' in activeConversation
      ? activeConversation.draft as Record<string, unknown>
      : undefined;
    const workspace = await this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    await this.prisma.auditEvent.create({
      data: {
        accountId: workspace.accountId,
        action: 'TEXT_NORMALIZED',
        entityType: 'Workspace',
        entityId: workspaceId,
        metadata: normalization as unknown as Prisma.InputJsonValue,
      },
    });
    const cancellation = parseExpenseCancellation(normalization.normalizedText);
    if (cancellation && body.conversationId) {
      if (activeSession && activeSession.intentType !== ConversationIntentType.CANCELLATION) {
        await this.conversationSessions.cancel(activeSession.id);
      }
      const result = await this.expenses.startLastExpenseCancellation({
        workspaceId,
        externalChatId: body.conversationId,
        actorUserId: request.user.id,
        criteria: cancellation,
      });
      if (result.status === 'NEEDS_CANCELLATION_REASON' && sessionKey) {
        await this.conversationSessions.start({
          ...sessionKey,
          workerId: 'expense-assistant',
          intentType: ConversationIntentType.CANCELLATION,
          contextJson: { expenseId: result.expenseId },
          pendingField: 'cancellationReason',
        });
      } else if (
        result.status === 'CANCELLATION_SELECTION_REQUIRED' &&
        sessionKey
      ) {
        await this.conversationSessions.start({
          ...sessionKey,
          workerId: 'expense-assistant',
          intentType: ConversationIntentType.CANCELLATION,
          contextJson: {
            candidates: result.candidates.map((candidate) => ({ ...candidate })),
          },
          pendingField: 'TARGET_EXPENSE',
        });
      }
      response.status(HttpStatus.ACCEPTED);
      return result;
    }
    if (activeSession && sessionKey) {
      const command = normalization.normalizedText.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
      if (/^(cancelar|olvidalo|salir)$/u.test(command)) {
        await this.conversationSessions.cancel(activeSession.id);
        response.status(HttpStatus.ACCEPTED);
        return { status: 'SESSION_CANCELLED', message: 'Operación cancelada.' };
      }
      if (activeSession.intentType === ConversationIntentType.CORRECTION) {
        await this.conversationSessions.cancel(activeSession.id);
        response.status(HttpStatus.CONFLICT);
        return { status: 'CORRECTION_NOT_ALLOWED', message: EXPENSE_CORRECTION_NOT_ALLOWED_MESSAGE };
      }
      if (activeSession.intentType === ConversationIntentType.CANCELLATION) {
        const context = activeSession.contextJson as {
          expenseId?: string;
          candidates?: readonly {
            expenseId: string;
            label: string;
            amount: string;
            currency: string;
            spenderName: string;
            occurredAt: string;
          }[];
        };
        if (activeSession.pendingField === 'TARGET_EXPENSE') {
          const selection = Number(normalization.normalizedText.trim());
          const selected = Number.isInteger(selection) && selection > 0
            ? context.candidates?.[selection - 1]
            : undefined;
          if (!selected) {
            response.status(HttpStatus.ACCEPTED);
            return {
              status: 'CANCELLATION_SELECTION_REQUIRED',
              message: '¿Cuál gasto quieres cancelar?',
              candidates: context.candidates ?? [],
              invalidSelection: true,
            };
          }
          const selectedResult = await this.expenses.startSelectedExpenseCancellation({
            workspaceId,
            expenseId: selected.expenseId,
            actorUserId: request.user.id,
          });
          if (selectedResult.status === 'CANCELLATION_REQUESTED') {
            await this.conversationSessions.complete(activeSession.id);
            response.status(HttpStatus.ACCEPTED);
            return selectedResult;
          }
          await this.conversationSessions.waitForInput(
            activeSession.id,
            { expenseId: selected.expenseId },
            'cancellationReason',
          );
          response.status(HttpStatus.ACCEPTED);
          return selectedResult;
        }
        if (!context.expenseId) throw new Error('Cancellation session has no expense target');
        const result = await this.expenses.cancelExpense({
          workspaceId, externalChatId: body.conversationId!, expenseId: context.expenseId,
          actorUserId: request.user.id, reason: normalization.normalizedText,
        });
        await this.conversationSessions.complete(activeSession.id);
        return result;
      }
      if (activeSession.intentType === ConversationIntentType.NEW_EXPENSE) {
        const context = activeSession.contextJson as unknown as {
          draft: Record<string, unknown>;
          missingFields: string[];
          sourceEventId?: string;
          captureSource?: 'EVIDENCE';
        };
        const draft = { ...context.draft };
        const pendingField = activeSession.pendingField ?? context.missingFields[0];
        const reply = normalization.normalizedText.trim();
        if (pendingField === 'originalAmount' || pendingField === 'amountCorrection') {
          const amount = reply.replace(/[$,\s]/gu, '');
          if (Number(amount) > 0) draft.originalAmount = amount;
        } else if (pendingField === 'spenderName') {
          draft.spenderName = /^(yo|fui yo)$/iu.test(reply) ? body.telegramUserName : reply;
        } else if (pendingField === 'paymentInstrumentDetails') {
          const details = this.parsePaymentInstrumentDetails(reply);
          if (details) {
            draft.paymentInstrumentName = details.name;
            draft.spenderName = details.holderName;
          }
        } else if (pendingField === 'paymentMethod') {
          if (/efectivo/iu.test(reply)) draft.paymentMethod = 'CASH';
          else if (/d[eé]bito/iu.test(reply)) draft.paymentMethod = 'DEBIT_CARD';
          else if (/cr[eé]dito|tarjeta/iu.test(reply)) draft.paymentMethod = 'CREDIT_CARD';
          else if (/transfer/iu.test(reply)) draft.paymentMethod = 'TRANSFER';
          else if (/cheque/iu.test(reply)) draft.paymentMethod = 'CHECK';
        } else if (pendingField === 'merchantName') draft.merchantName = reply;
        else if (pendingField === 'amountConfirmation') {
          const answer = reply.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
          if (answer === 'si') draft.amountConfirmed = true;
          else if (answer === 'no') {
            delete draft.originalAmount;
            await this.conversationSessions.waitForInput(
              activeSession.id,
              { draft, missingFields: ['amountCorrection'] } as Prisma.InputJsonValue,
              'amountCorrection',
            );
            response.status(HttpStatus.ACCEPTED);
            return { status: 'NEEDS_INFORMATION', missingFields: ['amountCorrection'], draft };
          }
        }
        const pendingValue = pendingField === 'paymentInstrumentDetails'
          ? draft.paymentInstrumentName && draft.spenderName
          : draft[pendingField!];
        if (!pendingValue) {
          response.status(HttpStatus.ACCEPTED);
          return { status: 'NEEDS_INFORMATION', missingFields: [pendingField], draft };
        }
        const interpretedEventId = context.sourceEventId ?? randomUUID();
        let nextRequired: ExpenseInformationRequiredPayload | undefined;
        const stopListening = this.eventBus.subscribe(EXPENSE_INFORMATION_REQUIRED, (result) => {
          if (result.correlationId === interpretedEventId) nextRequired = result.payload as ExpenseInformationRequiredPayload;
        });
        try {
          await this.eventBus.publish({
            eventId: interpretedEventId,
            type: EXPENSE_EVIDENCE_INTERPRETED,
            workspaceId,
            payload: draft,
            createdAt: new Date(),
            correlationId: interpretedEventId,
          });
        } finally {
          stopListening();
        }
        if (nextRequired) {
          await this.conversationSessions.waitForInput(
            activeSession.id,
            {
              draft: nextRequired.draft,
              missingFields: nextRequired.missingFields,
              ...(context.sourceEventId ? { sourceEventId: context.sourceEventId } : {}),
              ...(context.captureSource ? { captureSource: context.captureSource } : {}),
            },
            nextRequired.missingFields[0]!,
          );
          response.status(HttpStatus.ACCEPTED);
          return {
            status: 'NEEDS_INFORMATION',
            ...nextRequired,
            draft: {
              ...nextRequired.draft,
              ...(context.captureSource ? { captureSource: context.captureSource } : {}),
            },
          };
        }
        await this.conversationSessions.complete(activeSession.id);
        return this.expenses.getBySourceEventId(interpretedEventId);
      }
    }
    if (isPublishedExpenseCorrection(normalization.normalizedText)) {
      response.status(HttpStatus.CONFLICT);
      return { status: 'CORRECTION_NOT_ALLOWED', message: EXPENSE_CORRECTION_NOT_ALLOWED_MESSAGE };
    }
    if (
      body.conversationId &&
      conversationDraft?.operation === 'EXPENSE_CANCELLATION' &&
      typeof conversationDraft.expenseId === 'string'
    ) {
      return this.expenses.cancelExpense({
        workspaceId,
        externalChatId: body.conversationId,
        expenseId: conversationDraft.expenseId,
        actorUserId: request.user.id,
        reason: normalization.normalizedText,
      });
    }
    let required: ExpenseInformationRequiredPayload | undefined;
    const unsubscribe = this.eventBus.subscribe(EXPENSE_INFORMATION_REQUIRED, (result) => {
      if (result.correlationId === eventId) required = result.payload as ExpenseInformationRequiredPayload;
    });
    try {
      await this.eventBus.publish({
        eventId,
        type: EXPENSE_TEXT_RECEIVED,
        workspaceId,
        payload: {
          originalText: normalization.originalText,
          normalizedText: normalization.normalizedText,
          ...(body.telegramUserName ? { telegramUserName: body.telegramUserName } : {}),
          ...(body.sourceChannel ? { sourceChannel: body.sourceChannel } : {}),
          ...(body.conversationId ? { sourceConversationId: body.conversationId } : {}),
          userId: request.user.id,
        },
        createdAt: new Date(),
        correlationId: eventId,
      });
    } finally {
      unsubscribe();
    }
    if (required) {
      if (sessionKey) await this.conversationSessions.start({
        ...sessionKey,
        workerId: 'expense-assistant',
        intentType: ConversationIntentType.NEW_EXPENSE,
        contextJson: { draft: required.draft, missingFields: required.missingFields },
        pendingField: required.missingFields[0]!,
      });
      response.status(HttpStatus.ACCEPTED);
      return { status: 'NEEDS_INFORMATION', ...required };
    }
    const expense = await this.expenses.getBySourceEventId(eventId);
    if (body.conversationId) {
      await this.expenses.linkToConversation(workspaceId, expense.id, body.conversationId);
    }
    return expense;
  }

  private parsePaymentInstrumentDetails(
    reply: string,
  ): { name: string; holderName: string } | undefined {
    const match = reply.match(/^(.+?)[,;]?\s+(?:es\s+)?de\s+(.+)$/iu);
    if (!match?.[1] || !match[2]) return undefined;
    return { name: match[1].trim(), holderName: match[2].trim() };
  }

  @UseGuards(WorkspaceAccessGuard())
  @Get(':expenseId')
  getExpense(
    @Param('workspaceId') workspaceId: string,
    @Param('expenseId') expenseId: string,
  ) {
    return this.expenses.getById(workspaceId, expenseId);
  }
}
