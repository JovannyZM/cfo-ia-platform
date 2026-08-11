export interface TelegramPhotoSize {
  readonly file_id: string;
  readonly file_size?: number;
}

export interface TelegramMessage {
  readonly chat: { readonly id: number };
  readonly from?: { readonly first_name: string; readonly last_name?: string };
  readonly photo?: readonly TelegramPhotoSize[];
  readonly text?: string;
  readonly document?: {
    readonly file_id: string;
    readonly file_name?: string;
    readonly mime_type?: string;
  };
}

export interface TelegramUpdate {
  readonly update_id: number;
  readonly message?: TelegramMessage;
}

export interface RegisteredExpenseResponse {
  readonly expense: {
    readonly merchantName: string;
    readonly description?: string | null;
    readonly originalAmount: string | number;
    readonly originalCurrency: string;
    readonly occurredAt: string | Date;
    readonly paymentMethod?: string;
    readonly paymentLast4?: string;
    readonly spenderName: string;
    readonly paymentInstrumentId?: string;
    readonly paymentInstrumentName?: string;
    readonly paymentInstrument?: { readonly name: string } | null;
    readonly budgetAssignment?: {
      readonly status: 'ASSIGNED' | 'AMBIGUOUS' | 'UNMATCHED';
      readonly budget: { readonly name: string } | null;
    } | null;
  };
}
