import { z } from 'zod';

const rfcPattern = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

export const createTaxProfileRequestSchema = z.object({
  rfc: z.string().trim().toUpperCase().regex(rfcPattern, 'RFC inválido'),
  legalName: z.string().trim().min(2).max(200),
});
export type CreateTaxProfileRequestDto = z.infer<typeof createTaxProfileRequestSchema>;

export const rejectTaxProfileRequestSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type RejectTaxProfileRequestDto = z.infer<typeof rejectTaxProfileRequestSchema>;
