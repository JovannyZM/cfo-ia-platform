import {
  EXPENSE_EVIDENCE_INTERPRETED,
  EXPENSE_REGISTERED,
  EXPENSE_INFORMATION_REQUIRED,
  EXPENSE_TEXT_RECEIVED,
} from '@cfo-ia/domain';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma.service';
import { WorkerRegistry } from '../workers/worker-registry';
import { ExpenseAssistantWorker } from './expense-assistant.worker';
import { expenseEvidenceInterpretedSchema } from './expense.schemas';

describe('ExpenseAssistantWorker', () => {
  it('listens to ExpenseEvidenceInterpreted and emits ExpenseRegistered', () => {
    const worker = new ExpenseAssistantWorker(
      {} as PrismaService,
      new WorkerRegistry(),
    );
    expect(worker.listensTo).toEqual([EXPENSE_EVIDENCE_INTERPRETED, EXPENSE_TEXT_RECEIVED]);
    expect(worker.emits).toEqual([EXPENSE_REGISTERED, EXPENSE_INFORMATION_REQUIRED]);
  });

  it('does not receive or publish through EventBus', () => {
    const registry = new WorkerRegistry();
    const worker = new ExpenseAssistantWorker({} as PrismaService, registry);
    expect(registry.getAll()).toEqual([worker]);
    expect(ExpenseAssistantWorker.length).toBe(2);
  });

  it('validates positive amounts, ISO currency and valid dates', () => {
    const payload = {
      merchantName: 'Costco',
      occurredAt: '2026-07-29T18:00:00.000Z',
      originalAmount: '1250.50',
      originalCurrency: 'MXN',
    };
    expect(expenseEvidenceInterpretedSchema.safeParse(payload).success).toBe(true);
    expect(
      expenseEvidenceInterpretedSchema.safeParse({ ...payload, originalAmount: '-1' }).success,
    ).toBe(false);
    expect(
      expenseEvidenceInterpretedSchema.safeParse({ ...payload, originalCurrency: 'mxn' }).success,
    ).toBe(false);
    expect(
      expenseEvidenceInterpretedSchema.safeParse({ ...payload, occurredAt: 'not-a-date' }).success,
    ).toBe(false);
  });

  it('requests only the amount for a clear incomplete text expense', async () => {
    const worker = new ExpenseAssistantWorker({} as PrismaService, new WorkerRegistry());
    const events = await worker.execute({
      eventId: '10000000-0000-4000-8000-000000000001',
      type: EXPENSE_TEXT_RECEIVED,
      workspaceId: '10000000-0000-4000-8000-000000000002',
      payload: { originalText: 'Compré gasolina.', normalizedText: 'Compré gasolina.', telegramUserName: 'Jovanny' },
      createdAt: new Date(),
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe(EXPENSE_INFORMATION_REQUIRED);
    expect(events[0]?.payload).toMatchObject({
      missingFields: ['originalAmount'],
      draft: { merchantName: 'gasolina' },
    });
  });

  it.each(['85,000', '85000'])('does not register unusual gasoline amount %s before confirmation', async (amount) => {
    const create = vi.fn();
    const worker = new ExpenseAssistantWorker({ expense: { create } } as unknown as PrismaService, new WorkerRegistry());
    const events = await worker.execute({
      eventId: '10000000-0000-4000-8000-000000000003',
      type: EXPENSE_TEXT_RECEIVED,
      workspaceId: '10000000-0000-4000-8000-000000000002',
      payload: {
        originalText: `Compré gasolina por ${amount} pesos en efectivo, lo gastó Jovanny.`,
        normalizedText: `Compré gasolina por ${amount} pesos en efectivo, lo gastó Jovanny.`,
      },
      createdAt: new Date(),
    });
    expect(events[0]?.payload).toMatchObject({
      missingFields: ['amountConfirmation'],
      draft: { merchantName: 'gasolina', originalAmount: '85000', paymentMethod: 'CASH', spenderName: 'Jovanny' },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('asks once for details of an unknown card while preserving debit and last4', async () => {
    const prisma = {
      expense: { findUnique: vi.fn().mockResolvedValue(null) },
      workspace: {
        findUnique: vi.fn().mockResolvedValue({
          id: '10000000-0000-4000-8000-000000000002',
          accountId: '10000000-0000-4000-8000-000000000003',
          baseCurrency: 'MXN',
        }),
      },
      paymentInstrument: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const worker = new ExpenseAssistantWorker(prisma, new WorkerRegistry());
    const events = await worker.execute({
      eventId: '10000000-0000-4000-8000-000000000004',
      type: EXPENSE_EVIDENCE_INTERPRETED,
      workspaceId: '10000000-0000-4000-8000-000000000002',
      createdAt: new Date(),
      payload: {
        merchantName: 'Costco Wholesale', description: 'Compra en Costco',
        occurredAt: '2026-08-04T18:00:00.000Z', originalAmount: '598.20',
        originalCurrency: 'MXN', paymentMethod: 'DEBIT_CARD',
        paymentInstrumentType: 'CARD', paymentLast4: '1234',
      },
    });
    expect(events[0]?.payload).toMatchObject({
      missingFields: ['paymentInstrumentDetails'],
      draft: {
        paymentMethod: 'DEBIT_CARD',
        paymentInstrumentType: 'CARD',
        paymentLast4: '1234',
      },
    });
  });

  it('uses the holder of a known card and does not request the spender', async () => {
    const instrument = {
      id: '10000000-0000-4000-8000-000000000005',
      holderName: 'Jovanny',
    };
    const createdExpense = {
      id: '10000000-0000-4000-8000-000000000006',
      merchantName: 'Costco Wholesale', occurredAt: new Date('2026-08-04T18:00:00.000Z'),
      originalAmount: new (await import('@prisma/client')).Prisma.Decimal('598.20'),
      originalCurrency: 'MXN', exchangeRate: new (await import('@prisma/client')).Prisma.Decimal(1),
      baseAmount: new (await import('@prisma/client')).Prisma.Decimal('598.20'),
      paymentMethod: 'DEBIT_CARD', paymentLast4: '1234', spenderName: 'Jovanny',
      paymentInstrumentId: instrument.id, sourceChannel: 'TELEGRAM',
      sourceConversationId: '42',
    };
    const tx = {
      expense: { create: vi.fn().mockResolvedValue(createdExpense) },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
      temporaryEvidenceObject: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const upsert = vi.fn();
    const prisma = {
      expense: { findUnique: vi.fn().mockResolvedValue(null) },
      workspace: {
        findUnique: vi.fn().mockResolvedValue({
          id: '10000000-0000-4000-8000-000000000002',
          accountId: '10000000-0000-4000-8000-000000000003',
          baseCurrency: 'MXN',
        }),
      },
      paymentInstrument: {
        findUnique: vi.fn().mockResolvedValue(instrument),
        upsert,
      },
      $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    } as unknown as PrismaService;
    const worker = new ExpenseAssistantWorker(prisma, new WorkerRegistry());
    const events = await worker.execute({
      eventId: '10000000-0000-4000-8000-000000000004',
      type: EXPENSE_EVIDENCE_INTERPRETED,
      workspaceId: '10000000-0000-4000-8000-000000000002',
      createdAt: new Date(),
      payload: {
        merchantName: 'Costco Wholesale', description: 'Compra en Costco',
        occurredAt: '2026-08-04T18:00:00.000Z', originalAmount: '598.20',
        originalCurrency: 'MXN', paymentMethod: 'DEBIT_CARD',
        paymentInstrumentType: 'CARD', paymentLast4: '1234',
        sourceChannel: 'TELEGRAM', sourceConversationId: '42',
      },
    });
    expect(events[0]?.type).toBe(EXPENSE_REGISTERED);
    expect(events[0]?.payload).toMatchObject({ spenderName: 'Jovanny' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each([
    'GastÃ© 500 con la AMEX',
    'GastÃ© 500 con Amex',
    'GastÃ© 500 con American Express',
    'GastÃ© 500 con Amex Platinum',
  ])('registers %s using the configured instrument without asking payment method', async (text) => {
    const { Prisma } = await import('@prisma/client');
    const instrument = {
      id: '10000000-0000-4000-8000-000000000008',
      type: 'CREDIT_CARD',
      name: 'AMEX Aerom\u00e9xico Platinum',
      last4: null,
      holderName: 'Esli',
      aliases: ['amex', 'american express', 'amex platinum'],
    };
    const tx = {
      expense: { create: vi.fn().mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000006',
        workspaceId: '10000000-0000-4000-8000-000000000002',
        sourceEventId: '10000000-0000-4000-8000-000000000010',
        merchantName: 'Compra',
        description: 'Compra',
        occurredAt: new Date('2026-08-05T12:00:00.000Z'),
        originalAmount: new Prisma.Decimal(500),
        originalCurrency: 'MXN',
        exchangeRate: new Prisma.Decimal(1),
        baseAmount: new Prisma.Decimal(500),
        paymentMethod: 'CREDIT_CARD',
        paymentLast4: null,
        spenderName: 'Esli',
        paymentInstrumentId: instrument.id,
        sourceChannel: 'TELEGRAM',
        sourceConversationId: '42',
      }) },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
      temporaryEvidenceObject: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      expense: { findUnique: vi.fn().mockResolvedValue(null) },
      workspace: { findUnique: vi.fn().mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000002',
        accountId: '10000000-0000-4000-8000-000000000003',
        baseCurrency: 'MXN',
      }) },
      paymentInstrument: {
        findMany: vi.fn().mockResolvedValue([instrument]),
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    } as unknown as PrismaService;
    const worker = new ExpenseAssistantWorker(prisma, new WorkerRegistry());

    const events = await worker.execute({
      eventId: '10000000-0000-4000-8000-000000000010',
      type: EXPENSE_TEXT_RECEIVED,
      workspaceId: '10000000-0000-4000-8000-000000000002',
      payload: { originalText: text, normalizedText: text },
      createdAt: new Date(),
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe(EXPENSE_REGISTERED);
    expect(events[0]?.payload).toMatchObject({
      paymentMethod: 'CREDIT_CARD',
      paymentInstrumentId: instrument.id,
      paymentInstrumentName: instrument.name,
      spenderName: 'Esli',
    });
    expect(tx.expense.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        paymentMethod: 'CREDIT_CARD',
        paymentInstrumentId: instrument.id,
        spenderName: 'Esli',
      }),
    }));
  });

  it('registers PaguÃ© 369 a la maestra with spender and transfer method', async () => {
    const { Prisma } = await import('@prisma/client');
    const tx = {
      expense: { create: vi.fn().mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000011',
        workspaceId: '10000000-0000-4000-8000-000000000002',
        sourceEventId: '10000000-0000-4000-8000-000000000012',
        merchantName: 'maestra',
        description: 'maestra',
        occurredAt: new Date('2026-08-05T12:00:00.000Z'),
        originalAmount: new Prisma.Decimal(369),
        originalCurrency: 'MXN',
        exchangeRate: new Prisma.Decimal(1),
        baseAmount: new Prisma.Decimal(369),
        paymentMethod: 'TRANSFER',
        paymentLast4: null,
        spenderName: 'Esli',
        paymentInstrumentId: null,
        sourceChannel: 'TELEGRAM',
        sourceConversationId: '42',
      }) },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
      temporaryEvidenceObject: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      expense: { findUnique: vi.fn().mockResolvedValue(null) },
      workspace: { findUnique: vi.fn().mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000002',
        accountId: '10000000-0000-4000-8000-000000000003',
        baseCurrency: 'MXN',
      }) },
      paymentInstrument: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
      $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    } as unknown as PrismaService;
    const worker = new ExpenseAssistantWorker(prisma, new WorkerRegistry());
    const text = 'Pagu\u00e9 369 a la maestra, lo hizo Esli por transferencia.';

    const events = await worker.execute({
      eventId: '10000000-0000-4000-8000-000000000012',
      type: EXPENSE_TEXT_RECEIVED,
      workspaceId: '10000000-0000-4000-8000-000000000002',
      payload: { originalText: text, normalizedText: text },
      createdAt: new Date(),
    });

    expect(events[0]?.type).toBe(EXPENSE_REGISTERED);
    expect(events[0]?.payload).toMatchObject({
      merchantName: 'maestra',
      originalAmount: '369',
      spenderName: 'Esli',
      paymentMethod: 'TRANSFER',
    });
  });
});
