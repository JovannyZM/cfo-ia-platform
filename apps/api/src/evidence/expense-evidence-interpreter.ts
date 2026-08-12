import { z } from 'zod';

export const expenseInterpretationResultSchema = z.object({
  merchantName: z.string().min(1).nullable(),
  merchantRfc: z.string().regex(/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/).nullable(),
  description: z.string().min(1).nullable(),
  occurredAt: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?$/,
    )
    .nullable(),
  originalAmount: z.string().regex(/^\d+(\.\d+)?$/).nullable(),
  originalCurrency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  category: z.string().min(1).nullable(),
  paymentMethod: z.string().min(1).nullable(),
  paymentInstrumentType: z.enum(['CARD']).nullable(),
  paymentLast4: z.string().regex(/^\d{4}$/).nullable(),
  spenderName: z.string().min(1).nullable(),
  documentNumber: z.string().min(1).nullable(),
  documentIdentifiers: z.array(z.object({
    type: z.enum([
      'TICKET_NUMBER', 'ORDER_NUMBER', 'BARCODE', 'TRANSACTION_NUMBER',
      'AUTHORIZATION_NUMBER', 'REFERENCE_NUMBER', 'STORE_NUMBER', 'REGISTER_NUMBER', 'OTHER',
    ]),
    value: z.string().min(1),
  })).default([]),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});

export type ExpenseInterpretationResult = z.infer<
  typeof expenseInterpretationResultSchema
>;

export interface ExpenseEvidenceInterpreterInput {
  readonly image: Uint8Array;
  readonly mimeType: string;
  readonly extractedText?: string;
}

export interface ExpenseEvidenceInterpreter {
  interpret(input: ExpenseEvidenceInterpreterInput): Promise<ExpenseInterpretationResult>;
}

export const EXPENSE_EVIDENCE_INTERPRETER = Symbol('EXPENSE_EVIDENCE_INTERPRETER');
