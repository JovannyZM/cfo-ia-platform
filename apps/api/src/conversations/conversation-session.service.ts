import { Injectable } from '@nestjs/common';
import {
  ConversationIntentType,
  ConversationSessionStatus,
  Prisma,
  type ConversationSession,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';

export interface ConversationSessionKey {
  readonly workspaceId: string;
  readonly sourceChannel: string;
  readonly sourceConversationId: string;
  readonly userId: string;
}

export interface StartConversationSessionInput extends ConversationSessionKey {
  readonly workerId: string;
  readonly intentType: ConversationIntentType;
  readonly contextJson: Prisma.InputJsonValue;
  readonly pendingField?: string;
  readonly expiresAt?: Date;
}

const ACTIVE_STATUSES = [
  ConversationSessionStatus.ACTIVE,
  ConversationSessionStatus.WAITING_INPUT,
] as const;

@Injectable()
export class ConversationSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async getActive(key: ConversationSessionKey, now = new Date()): Promise<ConversationSession | null> {
    const session = await this.prisma.conversationSession.findFirst({
      where: { ...key, status: { in: [...ACTIVE_STATUSES] } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!session) return null;
    if (session.expiresAt && session.expiresAt <= now) {
      await this.transition(session, ConversationSessionStatus.EXPIRED, now);
      return null;
    }
    return session;
  }

  async start(input: StartConversationSessionInput, now = new Date()): Promise<ConversationSession> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.conversationSession.findFirst({
        where: {
          workspaceId: input.workspaceId,
          sourceChannel: input.sourceChannel,
          sourceConversationId: input.sourceConversationId,
          userId: input.userId,
          status: { in: [...ACTIVE_STATUSES] },
        },
      });
      if (existing) {
        await tx.conversationSession.update({
          where: { id: existing.id },
          data: { status: ConversationSessionStatus.CANCELLED, cancelledAt: now },
        });
        await this.audit(tx, existing, 'CONVERSATION_SESSION_CANCELLED', now);
      }
      const session = await tx.conversationSession.create({
        data: {
          workspaceId: input.workspaceId,
          sourceChannel: input.sourceChannel,
          sourceConversationId: input.sourceConversationId,
          userId: input.userId,
          workerId: input.workerId,
          intentType: input.intentType,
          status: input.pendingField
            ? ConversationSessionStatus.WAITING_INPUT
            : ConversationSessionStatus.ACTIVE,
          contextJson: input.contextJson,
          pendingField: input.pendingField ?? null,
          expiresAt: input.expiresAt ?? null,
        },
      });
      await this.audit(tx, session, 'CONVERSATION_SESSION_STARTED', now);
      return session;
    });
  }

  async waitForInput(
    sessionId: string,
    contextJson: Prisma.InputJsonValue,
    pendingField: string,
  ): Promise<ConversationSession> {
    return this.prisma.conversationSession.update({
      where: { id: sessionId },
      data: {
        status: ConversationSessionStatus.WAITING_INPUT,
        contextJson,
        pendingField,
      },
    });
  }

  async complete(sessionId: string, now = new Date()): Promise<ConversationSession> {
    const session = await this.prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
    return this.transition(session, ConversationSessionStatus.COMPLETED, now);
  }

  async cancel(sessionId: string, now = new Date()): Promise<ConversationSession> {
    const session = await this.prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
    return this.transition(session, ConversationSessionStatus.CANCELLED, now);
  }

  private async transition(
    session: ConversationSession,
    status: ConversationSessionStatus,
    now: Date,
  ): Promise<ConversationSession> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.conversationSession.update({
        where: { id: session.id },
        data: {
          status,
          pendingField: null,
          ...(status === ConversationSessionStatus.COMPLETED ? { completedAt: now } : {}),
          ...(status === ConversationSessionStatus.CANCELLED ? { cancelledAt: now } : {}),
        },
      });
      const action = status === ConversationSessionStatus.COMPLETED
        ? 'CONVERSATION_SESSION_COMPLETED'
        : status === ConversationSessionStatus.EXPIRED
          ? 'CONVERSATION_SESSION_EXPIRED'
          : 'CONVERSATION_SESSION_CANCELLED';
      await this.audit(tx, updated, action, now);
      return updated;
    });
  }

  private async audit(
    tx: Prisma.TransactionClient,
    session: ConversationSession,
    action: string,
    at: Date,
  ): Promise<void> {
    const workspace = await tx.workspace.findUniqueOrThrow({
      where: { id: session.workspaceId }, select: { accountId: true },
    });
    await tx.auditEvent.create({ data: {
      accountId: workspace.accountId,
      actorUserId: session.userId,
      action,
      entityType: 'ConversationSession',
      entityId: session.id,
      metadata: {
        intentType: session.intentType,
        status: session.status,
        workerId: session.workerId,
        at: at.toISOString(),
      },
    } });
  }
}
