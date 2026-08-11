/* eslint-disable @typescript-eslint/unbound-method */
import type { DailyCloseDeliveryStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma.service';
import type { TelegramAdapterService } from '../telegram/telegram-adapter.service';
import type { BudgetNotificationService, PreparedDailyClose } from './budget-notification.service';
import { DailyCloseSchedulerService, localClock } from './daily-close-scheduler.service';

type Delivery = {
  id: string;
  workspaceId: string;
  localDate: Date;
  channel: string;
  conversationId: string;
  status: DailyCloseDeliveryStatus;
  attemptedAt: Date;
  deliveredAt: Date | null;
  telegramMessageId: number | null;
  telegramMessageDateUtc: Date | null;
  telegramChatId: string | null;
  telegramResponseOk: boolean | null;
  error: string | null;
};

const workspaceId = 'workspace-id';
const prepared = {
  workspaceId,
  analysis: { status: 'ATTENTION' },
  changes: [{ currentStatus: 'ATTENTION' }],
  message: '📊 Cierre de gastos — 5 ago 2026\n\nHoy: $0\nMes: $6,625.75\nPresupuesto mensual: 6.5%\n\n🟡 Mounjaro lleva 96.3% de su presupuesto mensual.',
} as unknown as PreparedDailyClose;

function harness(input: { telegramOk?: boolean; analysisError?: Error; deliveries?: Delivery[] } = {}) {
  const deliveries = input.deliveries ?? [];
  const findDelivery = (key: { workspaceId: string; localDate: Date; channel: string; conversationId: string }) =>
    deliveries.find((delivery) =>
      delivery.workspaceId === key.workspaceId &&
      delivery.localDate.getTime() === key.localDate.getTime() &&
      delivery.channel === key.channel && delivery.conversationId === key.conversationId);
  type DeliveryKey = Parameters<typeof findDelivery>[0];
  type FindArgs = { where: { workspaceId_localDate_channel_conversationId: DeliveryKey } };
  type CreateArgs = { data: Omit<Delivery, 'id' | 'deliveredAt' | 'telegramMessageId' | 'telegramMessageDateUtc' | 'telegramChatId' | 'telegramResponseOk' | 'error'> };
  type UpdateArgs = { where: { id: string }; data: Partial<Delivery> };
  type UpdateManyArgs = { where: Pick<Delivery, 'id' | 'status'>; data: Partial<Delivery> };
  const prisma = {
    workspace: {
      findUnique: vi.fn().mockResolvedValue({ timezone: 'America/Mexico_City' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    expense: { findFirst: vi.fn().mockResolvedValue({ sourceConversationId: '12345' }) },
    conversationSession: { findFirst: vi.fn().mockResolvedValue(null) },
    dailyCloseDelivery: {
      findUnique: vi.fn(({ where }: FindArgs) => Promise.resolve(findDelivery(where.workspaceId_localDate_channel_conversationId))),
      create: vi.fn(({ data }: CreateArgs) => {
        const delivery: Delivery = {
          id: `delivery-${deliveries.length + 1}`, deliveredAt: null,
          telegramMessageId: null, telegramMessageDateUtc: null,
          telegramChatId: null, telegramResponseOk: null, error: null, ...data,
        };
        deliveries.push(delivery);
        return Promise.resolve(delivery);
      }),
      update: vi.fn(({ where, data }: UpdateArgs) => {
        const delivery = deliveries.find(({ id }) => id === where.id)!;
        Object.assign(delivery, data);
        return Promise.resolve(delivery);
      }),
      updateMany: vi.fn(({ where, data }: UpdateManyArgs) => {
        const delivery = deliveries.find(({ id, status }) => id === where.id && status === where.status);
        if (delivery) Object.assign(delivery, data);
        return Promise.resolve({ count: delivery ? 1 : 0 });
      }),
    },
  } as unknown as PrismaService;
  const notifications = {
    prepareDailyClose: input.analysisError
      ? vi.fn().mockRejectedValue(input.analysisError)
      : vi.fn().mockResolvedValue(prepared),
    markDelivery: vi.fn().mockResolvedValue(1),
  } as unknown as BudgetNotificationService;
  const telegram = {
    sendOutboundMessage: vi.fn().mockResolvedValue(input.telegramOk === false
      ? { ok: false }
      : { ok: true, result: { message_id: 987, date: 1_775_449_800, chat: { id: 12345 } } }),
  } as unknown as TelegramAdapterService;
  return {
    service: new DailyCloseSchedulerService(prisma, notifications, telegram),
    prisma, notifications, telegram, deliveries,
  };
}

describe('DailyCloseSchedulerService', () => {
  it('uses the Workspace timezone and its correct local date', () => {
    expect(localClock(new Date('2026-08-06T03:00:00.000Z'), 'America/Mexico_City'))
      .toEqual({ date: '2026-08-05', hour: 21 });
    expect(localClock(new Date('2026-08-06T03:00:00.000Z'), 'Europe/Madrid'))
      .toEqual({ date: '2026-08-06', hour: 5 });
  });

  it('runs only Workspaces whose local clock has reached 21:00', async () => {
    const { service, prisma } = harness();
    vi.mocked(prisma.workspace.findMany).mockResolvedValue([
      { id: 'mexico', timezone: 'America/Mexico_City' },
      { id: 'madrid', timezone: 'Europe/Madrid' },
    ] as never);
    const run = vi.spyOn(service, 'runWorkspace').mockResolvedValue({ status: 'DELIVERED' });
    await service.runDue(new Date('2026-08-06T03:00:00.000Z'));
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith('mexico', '2026-08-05');
  });

  it('sends even a zero-today close, marks delivery, and confirms budget state only on ok=true', async () => {
    const { service, notifications, telegram, deliveries } = harness();
    const result = await service.runWorkspace(workspaceId, '2026-08-05');
    expect(result).toMatchObject({ status: 'DELIVERED', telegramOk: true });
    expect(vi.mocked(telegram.sendOutboundMessage)).toHaveBeenCalledWith('12345', expect.stringContaining('Hoy: $0'));
    expect(vi.mocked(notifications.markDelivery)).toHaveBeenCalledWith(prepared, true);
    expect(deliveries[0]).toMatchObject({
      status: 'DELIVERED', deliveredAt: expect.any(Date), telegramMessageId: 987,
      telegramMessageDateUtc: new Date(1_775_449_800_000), telegramChatId: '12345', telegramResponseOk: true,
    });
  });

  it('does not duplicate after another execution or a simulated API restart', async () => {
    const shared: Delivery[] = [];
    const first = harness({ deliveries: shared });
    expect((await first.service.runWorkspace(workspaceId, '2026-08-05')).status).toBe('DELIVERED');
    const restarted = harness({ deliveries: shared });
    expect((await restarted.service.runWorkspace(workspaceId, '2026-08-05')).status).toBe('ALREADY_DELIVERED');
    expect(vi.mocked(restarted.telegram.sendOutboundMessage)).not.toHaveBeenCalled();
  });

  it('records Telegram failure, does not notify state, and permits controlled retry', async () => {
    const shared: Delivery[] = [];
    const failed = harness({ telegramOk: false, deliveries: shared });
    expect((await failed.service.runWorkspace(workspaceId, '2026-08-05')).status).toBe('FAILED');
    expect(shared[0]).toMatchObject({ status: 'FAILED', error: 'Telegram sendMessage returned an incomplete response' });
    expect(vi.mocked(failed.notifications.markDelivery)).toHaveBeenCalledWith(prepared, false);
    const retry = harness({ deliveries: shared });
    expect((await retry.service.runWorkspace(workspaceId, '2026-08-05')).status).toBe('DELIVERED');
    expect(shared).toHaveLength(1);
  });

  it('records analysis failure without sending or updating notification state', async () => {
    const { service, telegram, notifications, deliveries } = harness({ analysisError: new Error('analysis unavailable') });
    expect((await service.runWorkspace(workspaceId, '2026-08-05')).status).toBe('FAILED');
    expect(deliveries[0]).toMatchObject({ status: 'FAILED', error: 'analysis unavailable' });
    expect(vi.mocked(telegram.sendOutboundMessage)).not.toHaveBeenCalled();
    expect(vi.mocked(notifications.markDelivery)).not.toHaveBeenCalled();
  });

  it('keeps old deliveries without Telegram metadata compatible with idempotency', async () => {
    const oldDelivery: Delivery = {
      id: 'old-delivery', workspaceId, localDate: new Date('2026-08-05T00:00:00.000Z'),
      channel: 'TELEGRAM', conversationId: '12345', status: 'DELIVERED' as DailyCloseDeliveryStatus,
      attemptedAt: new Date(), deliveredAt: new Date(), error: null,
      telegramMessageId: null, telegramMessageDateUtc: null, telegramChatId: null, telegramResponseOk: null,
    };
    const { service, telegram } = harness({ deliveries: [oldDelivery] });
    expect((await service.runWorkspace(workspaceId, '2026-08-05')).status).toBe('ALREADY_DELIVERED');
    expect(vi.mocked(telegram.sendOutboundMessage)).not.toHaveBeenCalled();
  });
});
