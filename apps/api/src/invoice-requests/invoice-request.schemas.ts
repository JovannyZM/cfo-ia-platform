import { z } from 'zod';

export const createInvoiceRequestSchema = z.object({
  expenseId: z.string().uuid().optional(),
  sourceEvidenceId: z.string().uuid().optional(),
  documentNumber: z.string().trim().min(1).optional(),
  merchantName: z.string().trim().min(1).max(200),
  merchantKey: z.string().trim().min(1).max(80),
  channel: z.string().trim().min(1).max(40),
  taxProfileId: z.string().uuid().optional(),
  requestedByUserId: z.string().uuid(),
}).refine((value) => value.expenseId || value.sourceEvidenceId, {
  message: 'expenseId or sourceEvidenceId is required',
});

export type CreateInvoiceRequestInput = z.infer<typeof createInvoiceRequestSchema> & {
  readonly workspaceId: string;
};

export const invoiceCompletionSchema = z.object({
  externalReference: z.string().trim().min(1).optional(),
  xmlDocument: z.object({
    fileName: z.string().trim().min(1), storageReference: z.string().trim().min(1),
    checksum: z.string().regex(/^[a-f0-9]{64}$/iu),
  }).optional(),
  pdfDocument: z.object({
    fileName: z.string().trim().min(1), storageReference: z.string().trim().min(1),
    checksum: z.string().regex(/^[a-f0-9]{64}$/iu),
  }).optional(),
}).refine((value) => value.xmlDocument || value.pdfDocument, {
  message: 'At least one invoice document is required',
});

export type InvoiceCompletionInput = z.infer<typeof invoiceCompletionSchema>;
