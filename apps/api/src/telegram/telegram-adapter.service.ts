import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { parseMexicanMoney } from '../expenses/mexican-money';
import { LanguageNormalizer } from '../common/language-normalizer';
import { isLastExpenseCancellation } from '../expenses/expense-cancellation-parser';
import type {
  RegisteredExpenseResponse,
  TelegramUpdate,
} from './telegram.types';

const TELEGRAM_API_URL = 'https://api.telegram.org';
const POLLING_TIMEOUT_SECONDS = 25;

interface CancellationCandidateResponse {
  readonly label: string;
  readonly amount: string | number;
  readonly currency: string;
  readonly spenderName: string;
  readonly occurredAt: string | Date;
}

export interface TelegramSendMessageResponse {
  readonly ok?: boolean;
  readonly result?: {
    readonly message_id: number;
    readonly date: number;
    readonly chat: { readonly id: number };
  };
}

@Injectable()
export class TelegramAdapterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramAdapterService.name);
  private readonly abortController = new AbortController();
  private offset = 0;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly languageNormalizer: LanguageNormalizer,
  ) {}

  onModuleInit(): void {
    if (!this.isConfigured()) {
      this.logger.log('Telegram adapter disabled: configuration is incomplete');
      return;
    }

    this.running = true;
    this.logger.log('Telegram adapter started; long polling is active');
    void this.poll();
  }

  onModuleDestroy(): void {
    this.running = false;
    this.abortController.abort();
    this.logger.log('Telegram adapter stopped; long polling is inactive');
  }

  async sendOutboundMessage(conversationId: string, text: string): Promise<TelegramSendMessageResponse> {
    const chatId = Number(conversationId);
    if (!Number.isSafeInteger(chatId)) throw new Error('Telegram conversation id is invalid');
    return this.sendTelegramMessage(chatId, text);
  }

  async processUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message) return;

    try {
      if (message.text) {
        await this.processText(message);
        return;
      }
      const photo = message.photo?.[message.photo.length - 1];
      const pdf = message.document?.mime_type === 'application/pdf' ? message.document : undefined;
      if (!photo && !pdf) return;
      const media = await this.downloadFile(photo?.file_id ?? pdf!.file_id);
      const response = await this.sendToExpenseEndpoint(
        media,
        pdf ? 'application/pdf' : 'image/jpeg',
        pdf?.file_name ?? (pdf ? 'ticket.pdf' : 'ticket.jpg'),
        message.chat.id,
      );
      await this.handleExpenseResponse(message.chat.id, response);
    } catch (error: unknown) {
      this.logger.error(`Telegram ticket processing failed: ${this.safeError(error)}`);
      await this.sendTelegramMessage(
        message.chat.id,
        '❌ No pude procesar el ticket.',
      ).catch(() => undefined);
    }
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const updates = await this.telegramRequest<{ result: TelegramUpdate[] }>(
          'getUpdates',
          {
            offset: this.offset,
            timeout: POLLING_TIMEOUT_SECONDS,
            allowed_updates: ['message'],
          },
        );

        for (const update of updates.result) {
          await this.handleUpdate(update);
          this.offset = update.update_id + 1;
        }
      } catch (error: unknown) {
        if (!this.running || this.abortController.signal.aborted) return;
        this.logger.error(`Telegram polling failed: ${this.safeError(error)}`);
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const chatId = update.message?.chat.id;
    if (chatId === undefined) return;

    this.logger.log(`Telegram update received; chatId=${chatId}`);
    if (update.message?.text === 'prueba') {
      const result = await this.sendTelegramMessage(chatId, '✅ Conexión confirmada');
      this.logger.log(
        `Telegram connection confirmation sent; chatId=${chatId}; ok=${result.ok === true}`,
      );
      return;
    }

    await this.processUpdate(update);
  }

  private async downloadFile(fileId: string): Promise<Uint8Array> {
    const file = await this.telegramRequest<{
      result: { file_path?: string };
    }>('getFile', { file_id: fileId });
    if (!file.result.file_path) throw new Error('Telegram file path is missing');

    const response = await fetch(
      `${TELEGRAM_API_URL}/file/bot${this.botToken()}/${file.result.file_path}`,
      { signal: this.abortController.signal },
    );
    if (!response.ok) throw new Error(`Telegram file download failed (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }

  private async sendToExpenseEndpoint(
    image: Uint8Array,
    mimeType: string,
    filename: string,
    chatId: number,
  ): Promise<Response> {
    const form = new FormData();
    form.append('file', new Blob([image], { type: mimeType }), filename);
    form.append('sourceChannel', 'TELEGRAM');
    form.append('sourceConversationId', String(chatId));

    return fetch(
      `${this.internalApiUrl()}/workspaces/${this.workspaceId()}/expenses/evidence`,
      {
        method: 'POST',
        headers: { 'x-user-id': this.apiUserId() },
        body: form,
        signal: this.abortController.signal,
      },
    );
  }

  private async processText(message: NonNullable<TelegramUpdate['message']>): Promise<void> {
    // Conversation state belongs to the API; Telegram is only a transport adapter.
    const apiResponse = await this.sendTextExpense(message);
    await this.handleExpenseResponse(message.chat.id, apiResponse);
    return;

    const chatId = String(message.chat.id);
    const pending = await this.prisma.expenseConversation.findUnique({
      where: { workspaceId_externalChatId: { workspaceId: this.workspaceId(), externalChatId: chatId } },
    });
    if (!pending) return;
    const normalizedInput = this.languageNormalizer.normalize(message.text!, {
      activeExpenseConversation: Boolean(pending),
    }).normalizedText;
    if (isLastExpenseCancellation(normalizedInput)) {
      this.logExpenseTextRoute(Boolean(pending), 'CANCEL', 'CANCEL', 'CANCELLATION_PATTERN_MATCHED');
      const response = await this.sendTextExpense(message);
      await this.handleExpenseResponse(message.chat.id, response);
      return;
    }
    let draft: Record<string, unknown>;
    if (pending) {
      this.logExpenseTextRoute(true, 'UNKNOWN', 'CONTINUATION', 'NO_PRIORITY_INTENT_MATCHED');
      const pendingDraft = pending!.draft as Record<string, unknown>;
      if (pendingDraft.operation === 'EXPENSE_CANCELLATION') {
        const response = await this.sendTextExpense(message);
        await this.handleExpenseResponse(message.chat.id, response);
        return;
      }
      const normalizedReply = this.languageNormalizer.normalize(message.text!, {
        activeExpenseConversation: true,
      }).normalizedText;
      const contextualMessage = { ...message, text: normalizedReply };
      if (/^(cancelar|cancela|cancelado|cancela ese gasto)$/i.test(normalizedReply.trim())) {
        await this.prisma.expenseConversation.delete({ where: { id: pending!.id } });
        await this.sendTelegramMessage(message.chat.id, 'Operación cancelada.');
        return;
      }
      draft = { ...(pending!.draft as Record<string, unknown>) };
      const missing = pending!.missingFields[0];
      if (!missing) return;
      if (missing === 'amountConfirmation') {
        const confirmationReply = normalizedReply
          .trim()
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .toLowerCase();
        if (confirmationReply === 'si' || /^s/i.test(normalizedReply.trim())) {
          draft.amountConfirmed = true;
        } else if (confirmationReply === 'no') {
          delete draft.originalAmount;
          await this.prisma.expenseConversation.update({
            where: { id: pending!.id },
            data: { draft: draft as Prisma.InputJsonValue, missingFields: ['amountCorrection'] },
          });
          await this.sendTelegramMessage(message.chat.id, '¿Cuál es el importe correcto?');
          return;
        } else {
          await this.sendTelegramMessage(message.chat.id, this.question(missing!, draft));
          return;
        }
      }
      if (missing === 'spenderName') draft.spenderName = this.personFromReply(contextualMessage);
      if (missing === 'paymentMethod') draft.paymentMethod = this.paymentMethod(normalizedReply);
      if (missing === 'originalAmount' || missing === 'amountCorrection') {
        draft.originalAmount = parseMexicanMoney(normalizedReply);
      }
      if (missing === 'merchantName') draft.merchantName = normalizedReply.trim();
      const suppliedValue = missing === 'amountConfirmation'
        ? draft.amountConfirmed
        : missing === 'amountCorrection'
          ? draft.originalAmount
          : draft[missing!];
      if (!suppliedValue) {
        await this.sendTelegramMessage(message.chat.id, this.question(missing!, draft));
        return;
      }
    } else {
      this.logExpenseTextRoute(false, 'UNKNOWN', 'NEW_EXPENSE', 'NO_PRIORITY_INTENT_MATCHED');
      const response = await this.sendTextExpense(message);
      await this.handleExpenseResponse(message.chat.id, response);
      return;
    }
    draft = Object.fromEntries(Object.entries(draft).filter(([, value]) => value !== undefined));
    const locallyMissing = ['originalAmount', 'merchantName', 'spenderName', 'paymentMethod']
      .filter((field) => !draft[field]);
    if (locallyMissing.length) {
      await this.prisma.expenseConversation.upsert({
        where: { workspaceId_externalChatId: { workspaceId: this.workspaceId(), externalChatId: chatId } },
        create: { workspaceId: this.workspaceId(), externalChatId: chatId, draft: draft as Prisma.InputJsonValue, missingFields: locallyMissing },
        update: { draft: draft as Prisma.InputJsonValue, missingFields: locallyMissing },
      });
      await this.sendTelegramMessage(message.chat.id, this.question(locallyMissing[0]!, draft));
      return;
    }
    const response = await this.sendInterpretedExpense(draft);
    await this.handleExpenseResponse(message.chat.id, response);
  }

  private logExpenseTextRoute(
    activeConversation: boolean,
    intention: 'CANCEL' | 'UNKNOWN',
    route: 'CANCEL' | 'CONTINUATION' | 'NEW_EXPENSE',
    reason: string,
  ): void {
    this.logger.log(
      `Expense text routing; activeConversation=${activeConversation}; intention=${intention}; route=${route}; reason=${reason}`,
    );
  }

  private personFromReply(message: NonNullable<TelegramUpdate['message']>): string | undefined {
    const text = message.text?.trim();
    if (!text) return undefined;
    if (/^(yo|fui yo)$/i.test(text)) {
      return [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || undefined;
    }
    return text;
  }

  private paymentMethod(text: string): string | undefined {
    if (/efectivo/i.test(text)) return 'CASH';
    if (/d[eé]bito/i.test(text)) return 'DEBIT_CARD';
    if (/cr[eé]dito|tarjeta/i.test(text)) return 'CREDIT_CARD';
    if (/transfer/i.test(text)) return 'TRANSFER';
    return undefined;
  }

  private async sendInterpretedExpense(draft: Record<string, unknown>): Promise<Response> {
    return fetch(`${this.internalApiUrl()}/workspaces/${this.workspaceId()}/expenses/interpreted-evidence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': this.apiUserId() },
      body: JSON.stringify(draft),
      signal: this.abortController.signal,
    });
  }

  private async sendTextExpense(message: NonNullable<TelegramUpdate['message']>): Promise<Response> {
    const telegramUserName = [message.from?.first_name, message.from?.last_name]
      .filter(Boolean)
      .join(' ');
    return fetch(`${this.internalApiUrl()}/workspaces/${this.workspaceId()}/expenses/text`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': this.apiUserId() },
      body: JSON.stringify({
        text: message.text,
        conversationId: String(message.chat.id),
        sourceChannel: 'TELEGRAM',
        ...(telegramUserName ? { telegramUserName } : {}),
      }),
      signal: this.abortController.signal,
    });
  }

  private async handleExpenseResponse(chatId: number, response: Response): Promise<void> {
    const body = await response.json() as Record<string, unknown>;
    if (
      body.status === 'CANCELLATION_REQUESTED' ||
      body.status === 'NEEDS_CANCELLATION_REASON'
    ) {
      await this.sendTelegramMessage(chatId, this.responseMessageFromBody(response, body));
      return;
    }
    if (response.status === 202 && body.status === 'NEEDS_INFORMATION') {
      const missingFields = body.missingFields as string[];
      await this.sendTelegramMessage(
        chatId,
        this.question(missingFields[0]!, body.draft as Record<string, unknown>),
      );
      return;
    }
    await this.sendTelegramMessage(chatId, this.responseMessageFromBody(response, body));
  }

  private question(field: string, draft: Record<string, unknown> = {}): string {
    if (field === 'paymentInstrumentDetails') {
      return `Detecté una tarjeta terminación ${String(draft.paymentLast4)}. ¿Cómo se llama y de quién es?`;
    }
    if (field === 'spenderName') {
      return draft.captureSource === 'EVIDENCE' ? '¿Quién hizo este gasto?' : '¿Quién hizo el gasto?';
    }
    if (field === 'paymentMethod') return '¿Cómo se pagó?';
    if (field === 'originalAmount') return '¿Cuánto pagaste?';
    if (field === 'amountCorrection') return '¿Cuál es el importe correcto?';
    if (field === 'amountConfirmation') {
      const amount = Number(draft.originalAmount ?? 0).toLocaleString('en-US', {
        maximumFractionDigits: 2,
      });
      return `⚠️ El importe de $${amount} MXN parece inusual para gasolina. ¿Confirmas que es correcto?`;
    }
    return '¿Cuál fue el concepto o comercio?';
  }

  private async sendTelegramMessage(chatId: number, text: string): Promise<TelegramSendMessageResponse> {
    return this.telegramRequest<TelegramSendMessageResponse>('sendMessage', { chat_id: chatId, text });
  }

  private async telegramRequest<T>(method: string, body: unknown): Promise<T> {
    const response = await fetch(`${TELEGRAM_API_URL}/bot${this.botToken()}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: this.abortController.signal,
    });
    if (response.status === 409 && method === 'getUpdates') {
      throw new Error('TELEGRAM_POLLING_CONFLICT: another getUpdates consumer is active');
    }
    if (!response.ok) throw new Error(`Telegram API request failed (${response.status})`);
    return (await response.json()) as T;
  }

  private async responseMessage(response: Response): Promise<string> {
    const body: unknown = await response.json();
    return this.responseMessageFromBody(response, body);
  }

  private responseMessageFromBody(response: Response, body: unknown): string {
    if (
      typeof body === 'object' && body !== null &&
      'status' in body && body.status === 'CORRECTION_NOT_ALLOWED'
    ) {
      return 'No puedo modificar un gasto ya registrado. Debes cancelarlo y registrar uno nuevo.';
    }
    if (typeof body === 'object' && body !== null && 'status' in body) {
      if (body.status === 'CANCELLATION_REQUESTED') {
        return 'Solicité autorización para cancelar este gasto.';
      }
      if (body.status === 'NEEDS_CANCELLATION_REASON') {
        return '¿Cuál es el motivo de la cancelación?';
      }
      if (body.status === 'CANCELLED') {
        return '✅ Gasto cancelado.';
      }
      if (body.status === 'DUPLICATE_EVIDENCE') {
        return 'message' in body && typeof body.message === 'string'
          ? body.message
          : 'Este ticket ya fue registrado.';
      }
      if (body.status === 'MULTI_PAGE_PDF') {
        return 'Este PDF contiene varias páginas. En la versión actual solo se admite un comprobante por PDF.';
      }
      if ('errorCode' in body && body.errorCode === 'INVALID_EXPENSE_EVIDENCE') {
        return 'No detecté un comprobante de gasto válido.';
      }
      if (body.status === 'CANCELLATION_AMBIGUOUS') {
        return 'Encontré varios gastos. ¿Cuál quieres cancelar?';
      }
      if (body.status === 'CANCELLATION_NOT_FOUND') {
        return 'No encontré un gasto que coincida con esos datos.';
      }
      if (
        body.status === 'CANCELLATION_SELECTION_REQUIRED' &&
        'candidates' in body &&
        Array.isArray(body.candidates)
      ) {
        const lines = (body.candidates as unknown[]).flatMap((candidate, index) => {
          if (!this.isCancellationCandidate(candidate)) return [];
          return [
            `${index + 1}. ${candidate.label} — $${this.formatSelectionAmount(candidate.amount)} ${candidate.currency} — ${candidate.spenderName} — ${this.formatExpenseDate(candidate.occurredAt)}`,
          ];
        });
        return [
          '¿Cuál gasto quieres cancelar?',
          '',
          ...lines,
          '',
          'Responde con el número.',
        ].join('\n');
      }
      if (body.status === 'NO_RECENT_EXPENSE') {
        return 'No encontré un gasto reciente para corregir.';
      }
    }
    if (
      response.status === 202 ||
      (typeof body === 'object' &&
        body !== null &&
        'status' in body &&
        body.status === 'NEEDS_REVIEW')
    ) {
      return '⚠️ Necesito revisar este ticket.';
    }
    const expense = this.isRegisteredExpense(body)
      ? body.expense
      : this.isExpense(body)
        ? body
        : undefined;
    if (!response.ok || !expense) {
      return '❌ No pude procesar el ticket.';
    }

    const usefulConcept = this.conceptForDisplay(
      expense.merchantName,
      expense.description,
    );
    const assignedBudget = expense.budgetAssignment?.status === 'ASSIGNED'
      ? expense.budgetAssignment.budget?.name
      : undefined;
    const assignedDetail = assignedBudget
      ? this.conceptForDisplay(
          assignedBudget,
          expense.description?.trim() || expense.merchantName,
        )
      : undefined;
    const instrumentName = expense.paymentInstrumentName ?? expense.paymentInstrument?.name;
    const payment = instrumentName ?? [
      this.paymentMethodLabel(expense.paymentMethod),
      expense.paymentLast4 ? `****${expense.paymentLast4}` : undefined,
    ].filter(Boolean).join(' ');
    return [
      '✅ Gasto registrado',
      '',
      ...(assignedBudget
        ? [
            `📂 ${assignedBudget}`,
            ...(assignedDetail
              ? [`📝 ${assignedDetail.charAt(0).toLocaleUpperCase('es-MX') + assignedDetail.slice(1)}`]
              : []),
          ]
        : [
            `🏪 ${expense.merchantName}`,
            ...(usefulConcept
              ? [`📝 ${usefulConcept.charAt(0).toLocaleUpperCase('es-MX') + usefulConcept.slice(1)}`]
              : []),
          ]),
      `💰 $${this.formatAmount(expense.originalAmount)} ${expense.originalCurrency}`,
      `📅 ${this.formatExpenseDate(expense.occurredAt)}`,
      ...(instrumentName
        ? [`👤 ${expense.spenderName}`, `💳 ${payment}`]
        : [`💳 ${payment}`, `👤 ${expense.spenderName}`]),
    ].join('\n');
  }

  private conceptForDisplay(
    merchantName: string,
    description: string | null | undefined,
  ): string | undefined {
    if (!description?.trim()) return undefined;
    const normalize = (value: string): string => value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, ' ')
      .trim();
    const merchant = normalize(merchantName);
    const concept = normalize(description);
    const wrappedMerchant = concept.match(/^compra (?:en|de) (.+)$/u)?.[1];
    if (
      concept === merchant ||
      concept === `compra en ${merchant}` ||
      concept === `compra de ${merchant}` ||
      (wrappedMerchant !== undefined &&
        (merchant.includes(wrappedMerchant) || wrappedMerchant.includes(merchant)))
    ) {
      return undefined;
    }
    if (/^(?:\d+\s+)?(?:articulos?|productos?)$|^compra de (?:articulos?|productos?)$/u.test(concept)) {
      if (/costco|walmart|sam s/u.test(merchant)) return 'Compra de supermercado';
      if (/gasolin|combustible/u.test(merchant)) return 'Gasolina';
      if (/restaurante|restaurant/u.test(merchant)) return 'Consumo en restaurante';
      return undefined;
    }
    return description.trim();
  }

  private paymentMethodLabel(value: string | undefined): string {
    if (value === 'CASH') return 'Efectivo';
    if (value === 'DEBIT_CARD') return 'Débito';
    if (value === 'CREDIT_CARD') return 'Crédito';
    if (value === 'TRANSFER') return 'Transferencia';
    if (value === 'CHECK') return 'Cheque';
    return value ?? 'No identificado';
  }

  private formatAmount(value: string | number): string {
    return Number(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private formatSelectionAmount(value: string | number): string {
    const amount = Number(value);
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }

  private isCancellationCandidate(value: unknown): value is CancellationCandidateResponse {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.label === 'string' &&
      (typeof candidate.amount === 'string' || typeof candidate.amount === 'number') &&
      typeof candidate.currency === 'string' &&
      typeof candidate.spenderName === 'string' &&
      (typeof candidate.occurredAt === 'string' || candidate.occurredAt instanceof Date);
  }

  private formatExpenseDate(value: string | Date): string {
    return new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(value)).replace(/\./gu, '');
  }

  private isRegisteredExpense(value: unknown): value is RegisteredExpenseResponse {
    if (typeof value !== 'object' || value === null || !('expense' in value)) return false;
    const expense = value.expense;
    return (
      typeof expense === 'object' &&
      expense !== null &&
      'merchantName' in expense &&
      typeof expense.merchantName === 'string' &&
      'originalAmount' in expense &&
      typeof expense.originalAmount === 'string' &&
      'originalCurrency' in expense &&
      typeof expense.originalCurrency === 'string' &&
      'occurredAt' in expense &&
      typeof expense.occurredAt === 'string'
    );
  }

  private isExpense(value: unknown): value is RegisteredExpenseResponse['expense'] {
    return (
      typeof value === 'object' &&
      value !== null &&
      'merchantName' in value && typeof value.merchantName === 'string' &&
      'originalAmount' in value &&
        (typeof value.originalAmount === 'string' || typeof value.originalAmount === 'number') &&
      'originalCurrency' in value && typeof value.originalCurrency === 'string' &&
      'occurredAt' in value && (typeof value.occurredAt === 'string' || value.occurredAt instanceof Date) &&
      'spenderName' in value && typeof value.spenderName === 'string'
    );
  }

  private isConfigured(): boolean {
    return Boolean(
      process.env.TELEGRAM_BOT_TOKEN &&
        process.env.TELEGRAM_WORKSPACE_ID &&
        process.env.TELEGRAM_API_USER_ID,
    );
  }

  private botToken(): string {
    return process.env.TELEGRAM_BOT_TOKEN ?? '';
  }

  private workspaceId(): string {
    return process.env.TELEGRAM_WORKSPACE_ID ?? '';
  }

  private apiUserId(): string {
    return process.env.TELEGRAM_API_USER_ID ?? '';
  }

  private internalApiUrl(): string {
    const localPort = process.env.PORT ?? '3001';
    return (process.env.TELEGRAM_INTERNAL_API_URL ?? `http://127.0.0.1:${localPort}`).replace(
      /\/$/,
      '',
    );
  }

  private safeError(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}
