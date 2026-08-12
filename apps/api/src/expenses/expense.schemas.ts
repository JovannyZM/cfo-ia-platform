import { z } from 'zod';

const positiveDecimal = z.string().refine((value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}, 'Must be a positive decimal');

export const expenseEvidenceInterpretedSchema = z.object({
  merchantName: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  occurredAt: z.string().datetime(),
  originalAmount: positiveDecimal,
  originalCurrency: z.string().regex(/^[A-Z]{3}$/),
  exchangeRate: positiveDecimal.optional(),
  category: z.string().trim().min(1).optional(),
  paymentMethod: z.string().trim().min(1).optional(),
  paymentInstrumentType: z.literal('CARD').optional(),
  paymentInstrumentName: z.string().trim().min(1).optional(),
  paymentLast4: z.string().regex(/^\d{4}$/).optional(),
  spenderName: z.string().trim().min(1).optional(),
  amountConfirmed: z.boolean().optional(),
  inputSource: z.literal('TEXT').optional(),
  sourceChannel: z.string().trim().min(1).optional(),
  sourceConversationId: z.string().trim().min(1).optional(),
  evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  explicitBudgetName: z.string().trim().min(1).optional(),
  documentNumber: z.string().trim().min(1).optional(),
  documentIdentifiers: z.array(z.object({
    type: z.enum(['TICKET_NUMBER', 'ORDER_NUMBER', 'BARCODE', 'TRANSACTION_NUMBER', 'AUTHORIZATION_NUMBER', 'REFERENCE_NUMBER', 'STORE_NUMBER', 'REGISTER_NUMBER', 'OTHER']),
    value: z.string().trim().min(1),
  })).optional(),
  requestedByUserId: z.string().uuid().optional(),
});

export type ExpenseEvidenceInterpretedDto = z.infer<
  typeof expenseEvidenceInterpretedSchema
>;

export const expenseTextSchema = z.object({
  text: z.string().trim().min(1),
  telegramUserName: z.string().trim().min(1).optional(),
  conversationId: z.string().trim().min(1).optional(),
  sourceChannel: z.string().trim().min(1).optional(),
});
export type ExpenseTextDto = z.infer<typeof expenseTextSchema>;
