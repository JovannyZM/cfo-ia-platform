import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DailyCloseDeliveryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { TelegramAdapterService } from '../telegram/telegram-adapter.service';
import { BudgetNotificationService, type PreparedDailyClose } from './budget-notification.service';

const TELEGRAM_CHANNEL = 'TELEGRAM';
const CHECK_INTERVAL_MS = 60_000;

export interface DailyCloseExecutionResult {
  readonly status: 'DELIVERED' | 'ALREADY_DELIVERED' | 'IN_PROGRESS' | 'FAILED' | 'NO_CONVERSATION';
  readonly deliveryId?: string;
  readonly message?: string;
  readonly telegramOk?: boolean;
  readonly error?: string;
}

@Injectable()
export class DailyCloseSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DailyCloseSchedulerService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: BudgetNotificationService,
    private readonly telegram: TelegramAdapterService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.runDue().catch((error: unknown) => {
      this.logger.error(`Daily close scheduler failed: ${safeError(error)}`);
    }), CHECK_INTERVAL_MS);
    this.timer.unref();
    void this.runDue().catch((error: unknown) => {
      this.logger.error(`Daily close startup check failed: ${safeError(error)}`);
    });
    this.logger.log('Expense analysis daily-close scheduler started');
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runDue(now = new Date()): Promise<void> {
    const workspaces = await this.prisma.workspace.findMany({ select: { id: true, timezone: true } });
    for (const workspace of workspaces) {
      const local = localClock(now, workspace.timezone);
      if (local.hour < 21) continue;
      await this.runWorkspace(workspace.id, local.date);
    }
  }

  async runWorkspace(workspaceId: string, localDate?: string): Promise<DailyCloseExecutionResult> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId }, select: { timezone: true },
    });
    if (!workspace) return { status: 'FAILED', error: 'Workspace not found' };
    const date = localDate ?? localClock(new Date(), workspace.timezone).date;
    const conversationId = await this.resolveConversationId(workspaceId);
    if (!conversationId) return { status: 'NO_CONVERSATION', error: 'No Telegram conversation associated' };

    const localDateValue = new Date(`${date}T00:00:00.000Z`);
    const key = { workspaceId, localDate: localDateValue, channel: TELEGRAM_CHANNEL, conversationId };
    const reservation = await this.reserveDelivery(key);
    if (reservation.outcome !== 'RESERVED') return reservation.result;

    let prepared: PreparedDailyClose | undefined;
    let telegramResult: Awaited<ReturnType<TelegramAdapterService['sendOutboundMessage']>> | undefined;
    try {
      prepared = await this.notifications.prepareDailyClose(workspaceId, date);
      telegramResult = await this.telegram.sendOutboundMessage(conversationId, prepared.message);
      if (telegramResult.ok !== true || !telegramResult.result) {
        throw new Error('Telegram sendMessage returned an incomplete response');
      }

      await this.prisma.dailyCloseDelivery.update({
        where: { id: reservation.deliveryId },
        data: {
          status: DailyCloseDeliveryStatus.DELIVERED,
          deliveredAt: new Date(),
          telegramMessageId: telegramResult.result.message_id,
          telegramMessageDateUtc: telegramUnixSecondsToUtc(telegramResult.result.date),
          telegramChatId: String(telegramResult.result.chat.id),
          telegramResponseOk: true,
          error: null,
        },
      });
      await this.notifications.markDelivery(prepared, true);
      return {
        status: 'DELIVERED', deliveryId: reservation.deliveryId,
        message: prepared.message, telegramOk: true,
      };
    } catch (error: unknown) {
      if (prepared) await this.notifications.markDelivery(prepared, false);
      const message = safeError(error);
      await this.prisma.dailyCloseDelivery.update({
        where: { id: reservation.deliveryId },
        data: {
          status: DailyCloseDeliveryStatus.FAILED,
          telegramResponseOk: telegramResult?.ok ?? false,
          error: message.slice(0, 500),
        },
      });
      return { status: 'FAILED', deliveryId: reservation.deliveryId, error: message };
    }
  }

  private async reserveDelivery(key: {
    workspaceId: string;
    localDate: Date;
    channel: string;
    conversationId: string;
  }): Promise<
    | { outcome: 'RESERVED'; deliveryId: string }
    | { outcome: 'SKIPPED'; result: DailyCloseExecutionResult }
  > {
    const unique = { workspaceId_localDate_channel_conversationId: key };
    const existing = await this.prisma.dailyCloseDelivery.findUnique({ where: unique });
    if (existing?.status === DailyCloseDeliveryStatus.DELIVERED) {
      return { outcome: 'SKIPPED', result: { status: 'ALREADY_DELIVERED', deliveryId: existing.id } };
    }
    if (existing?.status === DailyCloseDeliveryStatus.PENDING) {
      return { outcome: 'SKIPPED', result: { status: 'IN_PROGRESS', deliveryId: existing.id } };
    }
    if (existing?.status === DailyCloseDeliveryStatus.FAILED) {
      const claimed = await this.prisma.dailyCloseDelivery.updateMany({
        where: { id: existing.id, status: DailyCloseDeliveryStatus.FAILED },
        data: { status: DailyCloseDeliveryStatus.PENDING, attemptedAt: new Date(), error: null },
      });
      if (claimed.count === 1) return { outcome: 'RESERVED', deliveryId: existing.id };
      return { outcome: 'SKIPPED', result: { status: 'IN_PROGRESS', deliveryId: existing.id } };
    }
    try {
      const created = await this.prisma.dailyCloseDelivery.create({
        data: { ...key, status: DailyCloseDeliveryStatus.PENDING, attemptedAt: new Date() },
      });
      return { outcome: 'RESERVED', deliveryId: created.id };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { outcome: 'SKIPPED', result: { status: 'IN_PROGRESS' } };
      }
      throw error;
    }
  }

  private async resolveConversationId(workspaceId: string): Promise<string | null> {
    const expense = await this.prisma.expense.findFirst({
      where: { workspaceId, sourceChannel: TELEGRAM_CHANNEL, sourceConversationId: { not: null } },
      orderBy: { createdAt: 'desc' }, select: { sourceConversationId: true },
    });
    if (expense?.sourceConversationId) return expense.sourceConversationId;
    const session = await this.prisma.conversationSession.findFirst({
      where: { workspaceId, sourceChannel: TELEGRAM_CHANNEL },
      orderBy: { updatedAt: 'desc' }, select: { sourceConversationId: true },
    });
    return session?.sourceConversationId ?? null;
  }
}

export function localClock(now: Date, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${value('year')}-${value('month')}-${value('day')}`, hour: Number(value('hour')) };
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function telegramUnixSecondsToUtc(seconds: number): Date {
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error('Telegram message date is invalid');
  return new Date(seconds * 1_000);
}
