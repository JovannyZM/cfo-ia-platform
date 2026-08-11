import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramAdapterService } from './telegram-adapter.service';
import type { PrismaService } from '../prisma.service';
import { LanguageNormalizer } from '../common/language-normalizer';

const photoUpdate = {
  update_id: 1,
  message: {
    chat: { id: 99 },
    photo: [{ file_id: 'small' }, { file_id: 'largest' }],
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, index: number): string {
  const body = fetchMock.mock.calls[index]?.[1]?.body;
  if (typeof body !== 'string') throw new Error('Expected a JSON request body');
  return body;
}

function prismaWithoutConversation(): PrismaService {
  return { expenseConversation: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) } } as unknown as PrismaService;
}

describe('TelegramAdapterService', () => {
  const normalizer = new LanguageNormalizer();
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_WORKSPACE_ID = 'workspace-id';
    process.env.TELEGRAM_API_USER_ID = 'user-id';
    process.env.TELEGRAM_INTERNAL_API_URL = 'http://localhost:3001';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('downloads the largest photo, reuses the expense endpoint and replies with its result', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ result: { file_path: 'photos/ticket.jpg' } }))
      .mockResolvedValueOnce(new Response(Uint8Array.from([0xff, 0xd8, 0xff])))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            expense: {
              merchantName: 'Costco',
              description: 'Costco',
              originalAmount: '598.2',
              originalCurrency: 'MXN',
              occurredAt: '2026-07-08T18:45:00.000Z',
              paymentMethod: 'DEBIT_CARD',
              paymentLast4: '0494',
              spenderName: 'Esli',
            },
          },
          201,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new TelegramAdapterService(prismaWithoutConversation(), normalizer).processUpdate(photoUpdate);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('largest');
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      'http://localhost:3001/workspaces/workspace-id/expenses/evidence',
    );
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toEqual({ 'x-user-id': 'user-id' });
    const telegramReply = JSON.parse(requestBody(fetchMock, 3)) as {
      text: string;
    };
    expect(telegramReply.text).toBe([
      '✅ Gasto registrado', '', '🏪 Costco',
      '💰 $598.20 MXN', '📅 8 jul 2026', '💳 Débito ****0494', '👤 Esli',
    ].join('\n'));
  });

  it('asks for review when the existing endpoint returns NEEDS_REVIEW', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ result: { file_path: 'photos/ticket.jpg' } }))
      .mockResolvedValueOnce(new Response(Uint8Array.from([0xff, 0xd8, 0xff])))
      .mockResolvedValueOnce(jsonResponse({ status: 'NEEDS_REVIEW' }, 202))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new TelegramAdapterService(prismaWithoutConversation(), normalizer).processUpdate(photoUpdate);

    const telegramReply = JSON.parse(requestBody(fetchMock, 3)) as {
      text: string;
    };
    expect(telegramReply.text).toBe('⚠️ Necesito revisar este ticket.');
  });

  it('asks once for the name and holder of an unknown card', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ result: { file_path: 'photos/ticket.jpg' } }))
      .mockResolvedValueOnce(new Response(Uint8Array.from([0xff, 0xd8, 0xff])))
      .mockResolvedValueOnce(jsonResponse({
        status: 'NEEDS_INFORMATION',
        missingFields: ['paymentInstrumentDetails'],
        draft: {
          merchantName: 'Costco Wholesale',
          paymentMethod: 'DEBIT_CARD',
          paymentInstrumentType: 'CARD',
          paymentLast4: '9837',
        },
      }, 202))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new TelegramAdapterService(prismaWithoutConversation(), normalizer)
      .processUpdate(photoUpdate);

    const telegramReply = JSON.parse(requestBody(fetchMock, 3)) as { text: string };
    expect(telegramReply.text)
      .toBe('Detecté una tarjeta terminación 9837. ¿Cómo se llama y de quién es?');
  });

  it('returns the generic error message when processing fails', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ result: { file_path: 'photos/ticket.jpg' } }))
      .mockResolvedValueOnce(new Response(Uint8Array.from([0xff, 0xd8, 0xff])))
      .mockResolvedValueOnce(jsonResponse({ status: 'FAILED' }, 422))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new TelegramAdapterService(prismaWithoutConversation(), normalizer).processUpdate(photoUpdate);

    const telegramReply = JSON.parse(requestBody(fetchMock, 3)) as {
      text: string;
    };
    expect(telegramReply.text).toBe('❌ No pude procesar el ticket.');
  });

  it('sends a Telegram PDF through the existing evidence endpoint', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ result: { file_path: 'documents/ticket.pdf' } }))
      .mockResolvedValueOnce(new Response(new TextEncoder().encode('%PDF-1.7')))
      .mockResolvedValueOnce(jsonResponse({ expense: {
        merchantName: 'Costco', originalAmount: '100', originalCurrency: 'MXN',
        occurredAt: '2026-08-04T00:00:00.000Z', spenderName: 'Jovanny', paymentMethod: 'CASH',
      } }, 201))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new TelegramAdapterService(prismaWithoutConversation(), normalizer).processUpdate({ update_id: 2, message: {
      chat: { id: 99 }, document: { file_id: 'pdf', file_name: 'ticket.pdf', mime_type: 'application/pdf' },
    } });

    expect(fetchMock.mock.calls[2]?.[0]).toBe('http://localhost:3001/workspaces/workspace-id/expenses/evidence');
    expect((fetchMock.mock.calls[2]?.[1]?.body as FormData).get('file')).toBeInstanceOf(Blob);
  });

  it.each([
    [{
      status: 'MULTI_PAGE_PDF',
      message: 'Este PDF contiene varias páginas. En la versión actual solo se admite un comprobante por PDF.',
    }, 'Este PDF contiene varias páginas. En la versión actual solo se admite un comprobante por PDF.'],
    [{
      status: 'FAILED', errorCode: 'INVALID_EXPENSE_EVIDENCE',
      reason: 'No detecté un comprobante de gasto válido.',
    }, 'No detecté un comprobante de gasto válido.'],
    [{
      status: 'DUPLICATE_EVIDENCE', message: 'Este comprobante ya fue registrado.',
      expenseId: 'existing-expense',
    }, 'Este comprobante ya fue registrado.'],
  ] as const)('returns the specific PDF response through Telegram', async (apiBody, expectedMessage) => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ result: { file_path: 'documents/ticket.pdf' } }))
      .mockResolvedValueOnce(new Response(new TextEncoder().encode('%PDF-1.7')))
      .mockResolvedValueOnce(jsonResponse(apiBody, 422))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new TelegramAdapterService(prismaWithoutConversation(), normalizer).processUpdate({
      update_id: 22,
      message: {
        chat: { id: 99 },
        document: { file_id: 'pdf', file_name: 'ticket.pdf', mime_type: 'application/pdf' },
      },
    });

    expect(JSON.parse(requestBody(fetchMock, 3))).toEqual({ chat_id: 99, text: expectedMessage });
  });

  it('forwards text to the API and leaves conversation persistence to the API', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = { expenseConversation: {
      findUnique: vi.fn().mockResolvedValue(null), upsert, deleteMany: vi.fn(),
    } } as unknown as PrismaService;
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        status: 'NEEDS_INFORMATION', missingFields: ['spenderName'],
        draft: { merchantName: 'café', occurredAt: '2026-08-04T00:00:00.000Z', originalAmount: '380', originalCurrency: 'MXN' },
      }, 202))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new TelegramAdapterService(prisma, normalizer).processUpdate({ update_id: 3, message: {
      chat: { id: 99 }, from: { first_name: 'Jovanny' }, text: 'Compré café por 380.',
    } });

    expect(upsert).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3001/workspaces/workspace-id/expenses/text');
    const sentText = JSON.parse(requestBody(fetchMock, 0)) as { text: string };
    expect(sentText.text).toBe('Compré café por 380.');
    const reply = JSON.parse(requestBody(fetchMock, 1)) as { text: string };
    expect(reply.text).toBe('¿Quién hizo el gasto?');
  });

  it('does not repeat the merchant as concept for a registered text expense', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        merchantName: 'Costco',
        description: 'Costco',
        originalAmount: '300',
        originalCurrency: 'MXN',
        occurredAt: '2026-07-08T12:00:00.000Z',
        paymentMethod: 'CASH',
        spenderName: 'JZM',
      }, 201))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new TelegramAdapterService(prismaWithoutConversation(), normalizer)
      .processUpdate({
        update_id: 20,
        message: {
          chat: { id: 99 },
          from: { first_name: 'JZM' },
          text: 'Gasté 300 en Costco',
        },
      });

    const reply = JSON.parse(requestBody(fetchMock, 1)) as { text: string };
    expect(reply.text).toBe([
      '✅ Gasto registrado', '', '🏪 Costco', '💰 $300.00 MXN',
      '📅 8 jul 2026', '💳 Efectivo', '👤 JZM',
    ].join('\n'));
    expect(reply.text).not.toContain('📝');
  });

  it('shows the configured instrument name separately from its holder', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        merchantName: 'Compra',
        originalAmount: '500',
        originalCurrency: 'MXN',
        occurredAt: '2026-08-05T12:00:00.000Z',
        paymentMethod: 'CREDIT_CARD',
        spenderName: 'Esli',
        paymentInstrument: { name: 'AMEX Aerom\u00e9xico Platinum' },
      }, 201))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new TelegramAdapterService(prismaWithoutConversation(), normalizer)
      .processUpdate({
        update_id: 21,
        message: { chat: { id: 99 }, text: 'Gasté 500 con la AMEX' },
      });

    const reply = JSON.parse(requestBody(fetchMock, 1)) as { text: string };
    expect(reply.text).toContain('👤 Esli\n💳 AMEX Aerom\u00e9xico Platinum');
    expect(reply.text).not.toContain('💳 Crédito');
  });

  it('shows an assigned Budget followed by the specific expense detail', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        merchantName: 'miss Adri',
        description: 'miss Adri',
        originalAmount: '369',
        originalCurrency: 'MXN',
        occurredAt: '2026-08-05T12:00:00.000Z',
        paymentMethod: 'TRANSFER',
        spenderName: 'Esli',
        budgetAssignment: { status: 'ASSIGNED', budget: { name: 'Clases' } },
      }, 201))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new TelegramAdapterService(prismaWithoutConversation(), normalizer)
      .processUpdate({
        update_id: 22,
        message: { chat: { id: 99 }, text: 'Pagu\u00e9 369 a la miss Adri' },
      });

    const reply = JSON.parse(requestBody(fetchMock, 1)) as { text: string };
    expect(reply.text).toBe([
      '✅ Gasto registrado', '', '📂 Clases', '📝 Miss Adri',
      '💰 $369.00 MXN', '📅 5 ago 2026', '💳 Transferencia', '👤 Esli',
    ].join('\n'));
  });

  it('does not duplicate an assigned Budget when the expense concept is redundant', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        merchantName: 'Clases', description: 'Clases', originalAmount: '500',
        originalCurrency: 'MXN', occurredAt: '2026-08-05T12:00:00.000Z',
        paymentMethod: 'CASH', spenderName: 'Esli',
        budgetAssignment: { status: 'ASSIGNED', budget: { name: 'Clases' } },
      }, 201))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new TelegramAdapterService(prismaWithoutConversation(), normalizer)
      .processUpdate({ update_id: 23, message: { chat: { id: 99 }, text: 'Clases 500' } });

    const reply = JSON.parse(requestBody(fetchMock, 1)) as { text: string };
    expect(reply.text.match(/Clases/gu)).toHaveLength(1);
    expect(reply.text).not.toContain('📝');
  });

  it('continues an unusual expense when the user confirms Sí', async () => {
    const draft = {
      merchantName: 'gasolina', occurredAt: '2026-08-04T00:00:00.000Z',
      originalAmount: '85000', originalCurrency: 'MXN', paymentMethod: 'CASH',
      spenderName: 'Jovanny', inputSource: 'TEXT',
    };
    const prisma = { expenseConversation: {
      findUnique: vi.fn().mockResolvedValue({ id: 'conversation', draft, missingFields: ['amountConfirmation'] }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }), upsert: vi.fn(), update: vi.fn(),
    } } as unknown as PrismaService;
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ...draft, originalAmount: '85000', id: 'expense-id' }, 201))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new TelegramAdapterService(prisma, normalizer).processUpdate({
      update_id: 4, message: { chat: { id: 99 }, text: 'Sí' },
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3001/workspaces/workspace-id/expenses/text');
    const submitted = JSON.parse(requestBody(fetchMock, 0)) as { text: string };
    expect(submitted.text).toBe('S\u00ed');
    expect(JSON.parse(requestBody(fetchMock, 1))).toMatchObject({
      chat_id: 99,
      text: expect.stringContaining('📅 4 ago 2026'),
    });
  });

  it('keeps known fields and asks only for the corrected amount when the user says No', async () => {
    const draft = {
      merchantName: 'gasolina', occurredAt: '2026-08-04T00:00:00.000Z',
      originalAmount: '85000', originalCurrency: 'MXN', paymentMethod: 'CASH',
      spenderName: 'Jovanny', inputSource: 'TEXT',
    };
    const update = vi.fn().mockResolvedValue({});
    const prisma = { expenseConversation: {
      findUnique: vi.fn().mockResolvedValue({ id: 'conversation', draft, missingFields: ['amountConfirmation'] }),
      update, deleteMany: vi.fn(), upsert: vi.fn(),
    } } as unknown as PrismaService;
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        status: 'NEEDS_INFORMATION', missingFields: ['amountCorrection'], draft,
      }, 202))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new TelegramAdapterService(prisma, normalizer).processUpdate({
      update_id: 5, message: { chat: { id: 99 }, text: 'No' },
    });

    expect(update).not.toHaveBeenCalled();
    expect(JSON.parse(requestBody(fetchMock, 1))).toMatchObject({
      chat_id: 99, text: '¿Cuál es el importe correcto?',
    });
  });

  it('renders the policy response without treating a correction as a new expense', async () => {
    const prisma = { expenseConversation: {
      findUnique: vi.fn().mockResolvedValue(null), deleteMany: vi.fn(),
    } } as unknown as PrismaService;
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        status: 'CORRECTION_NOT_ALLOWED',
        message: 'No puedo modificar un gasto ya registrado. Debes cancelarlo y registrar uno nuevo.',
      }, 409))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new TelegramAdapterService(prisma, normalizer).processUpdate({
      update_id: 6, message: { chat: { id: 99 }, text: 'En realidad fueron 820.' },
    });

    expect(JSON.parse(requestBody(fetchMock, 1))).toEqual({
      chat_id: 99,
      text: 'No puedo modificar un gasto ya registrado. Debes cancelarlo y registrar uno nuevo.',
    });
  });

  it('routes cancellation before an open incomplete-expense conversation', async () => {
    const upsert = vi.fn();
    const prisma = { expenseConversation: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'pending-expense', draft: { merchantName: 'gasolina' },
        missingFields: ['originalAmount'],
      }),
      upsert, deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    } } as unknown as PrismaService;
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        status: 'NEEDS_CANCELLATION_REASON',
        message: '¿Cuál es el motivo de la cancelación?',
        expenseId: 'expense-id',
      }, 202))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new TelegramAdapterService(prisma, normalizer).processUpdate({
      update_id: 7, message: { chat: { id: 99 }, text: 'Cancela el último gasto.' },
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:3001/workspaces/workspace-id/expenses/text',
    );
    expect(upsert).not.toHaveBeenCalled();
    expect(JSON.parse(requestBody(fetchMock, 1))).toEqual({
      chat_id: 99, text: '¿Cuál es el motivo de la cancelación?',
    });
  });

  it('renders the persisted cancellation candidates as a numbered Telegram selection', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        status: 'CANCELLATION_SELECTION_REQUIRED',
        message: '¿Cuál gasto quieres cancelar?',
        candidates: [
          { expenseId: 'one', label: 'Comida', amount: '450', currency: 'MXN', spenderName: 'JZM', occurredAt: '2026-08-04T12:00:00.000Z' },
          { expenseId: 'two', label: 'Costco', amount: '598.2', currency: 'MXN', spenderName: 'Esli', occurredAt: '2026-08-04T12:00:00.000Z' },
        ],
      }, 202))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new TelegramAdapterService(prismaWithoutConversation(), normalizer).processUpdate({
      update_id: 21, message: { chat: { id: 99 }, text: 'Cancela el gasto de 450 por comida' },
    });

    expect(JSON.parse(requestBody(fetchMock, 1))).toEqual({
      chat_id: 99,
      text: [
        '¿Cuál gasto quieres cancelar?', '',
        '1. Comida — $450 MXN — JZM — 4 ago 2026',
        '2. Costco — $598.20 MXN — Esli — 4 ago 2026', '',
        'Responde con el número.',
      ].join('\n'),
    });
  });

  it.each([
    'No fueron 300, fueron 250.',
    'En realidad fueron 250.',
    'Me equivoqué, eran 250.',
  ])('rejects correction before an open conversation: %s', async (text) => {
    const upsert = vi.fn();
    const prisma = { expenseConversation: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'pending-expense', draft: { merchantName: 'otro gasto' },
        missingFields: ['spenderName', 'paymentMethod'],
      }),
      upsert, deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    } } as unknown as PrismaService;
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        status: 'CORRECTION_NOT_ALLOWED',
        message: 'No puedo modificar un gasto ya registrado. Debes cancelarlo y registrar uno nuevo.',
      }, 409))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new TelegramAdapterService(prisma, normalizer).processUpdate({
      update_id: 8, message: { chat: { id: 99 }, text },
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:3001/workspaces/workspace-id/expenses/text',
    );
    expect(upsert).not.toHaveBeenCalled();
    const telegramReply = JSON.parse(requestBody(fetchMock, 1)) as { text: string };
    expect(telegramReply.text).toBe(
      'No puedo modificar un gasto ya registrado. Debes cancelarlo y registrar uno nuevo.',
    );
    expect(telegramReply.text).not.toMatch(/Qui[eé]n|C[oó]mo se pag[oó]/u);
  });
});
