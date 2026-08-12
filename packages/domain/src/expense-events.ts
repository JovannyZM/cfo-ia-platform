export const EXPENSE_EVIDENCE_INTERPRETED = 'ExpenseEvidenceInterpreted' as const;
export const EXPENSE_REGISTERED = 'ExpenseRegistered' as const;
export const EXPENSE_INFORMATION_REQUIRED = 'ExpenseInformationRequired' as const;
export const EXPENSE_TEXT_RECEIVED = 'ExpenseTextReceived' as const;
export const EXPENSE_EVIDENCE_RECEIVED = 'ExpenseEvidenceReceived' as const;
export const EXPENSE_EVIDENCE_INTERPRETATION_FAILED =
  'ExpenseEvidenceInterpretationFailed' as const;

export type ExpenseDocumentIdentifierType =
  | 'TICKET_NUMBER' | 'ORDER_NUMBER' | 'BARCODE' | 'TRANSACTION_NUMBER'
  | 'AUTHORIZATION_NUMBER' | 'REFERENCE_NUMBER' | 'STORE_NUMBER'
  | 'REGISTER_NUMBER' | 'OTHER';

export interface ExpenseDocumentIdentifier extends Readonly<Record<string, string>> {
  readonly type: ExpenseDocumentIdentifierType;
  readonly value: string;
}

export interface ExpenseEvidenceInterpretedPayload {
  readonly merchantName: string;
  readonly description?: string;
  readonly occurredAt: string;
  readonly originalAmount: string;
  readonly originalCurrency: string;
  readonly exchangeRate?: string;
  readonly category?: string;
  readonly paymentMethod?: string;
  readonly paymentInstrumentType?: 'CARD';
  readonly paymentInstrumentName?: string;
  readonly paymentLast4?: string;
  readonly spenderName?: string;
  readonly amountConfirmed?: boolean;
  readonly inputSource?: 'TEXT';
  readonly sourceChannel?: string;
  readonly sourceConversationId?: string;
  readonly evidenceSha256?: string;
  readonly explicitBudgetName?: string;
  readonly documentNumber?: string;
  readonly documentIdentifiers?: ExpenseDocumentIdentifier[];
  readonly requestedByUserId?: string;
}

export interface ExpenseEvidenceReceivedPayload {
  readonly image: Uint8Array;
  readonly mimeType: string;
  readonly extractedText?: string;
  readonly sourceChannel?: string;
  readonly sourceConversationId?: string;
  readonly evidenceSha256?: string;
  readonly requestedByUserId?: string;
}

export interface ExpenseEvidenceInterpretationFailedPayload {
  readonly code: string;
  readonly reason: string;
  readonly confidence: number;
  readonly missingFields: readonly string[];
  readonly warnings: readonly string[];
}

export interface ExpenseRegisteredPayload {
  readonly expenseId: string;
  readonly merchantName: string;
  readonly occurredAt: string;
  readonly originalAmount: string;
  readonly originalCurrency: string;
  readonly exchangeRate: string;
  readonly baseAmount: string;
  readonly baseCurrency: string;
  readonly status: 'REGISTERED';
  readonly paymentMethod?: string;
  readonly paymentLast4?: string;
  readonly spenderName: string;
  readonly paymentInstrumentId?: string;
  readonly paymentInstrumentName?: string;
  readonly sourceChannel?: string;
  readonly sourceConversationId?: string;
  readonly explicitBudgetName?: string;
  readonly documentNumber?: string;
  readonly documentIdentifiers?: ExpenseDocumentIdentifier[];
  readonly requestedByUserId?: string;
}

export interface ExpenseInformationRequiredPayload {
  readonly missingFields: readonly (
    | 'merchantName'
    | 'originalAmount'
    | 'spenderName'
    | 'paymentMethod'
    | 'paymentInstrumentDetails'
    | 'amountConfirmation'
    | 'amountCorrection'
  )[];
  readonly draft: Partial<ExpenseEvidenceInterpretedPayload>;
}

export interface ExpenseTextReceivedPayload {
  readonly originalText: string;
  readonly normalizedText: string;
  readonly telegramUserName?: string;
  readonly sourceChannel?: string;
  readonly sourceConversationId?: string;
  readonly userId?: string;
}
