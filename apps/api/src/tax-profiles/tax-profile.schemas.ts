import { z } from 'zod';

function validRfcDate(value: string): boolean {
  const date = value.slice(value.length === 12 ? 3 : 4, -3);
  const month = Number(date.slice(2, 4));
  const day = Number(date.slice(4, 6));
  if (month < 1 || month > 12 || day < 1) return false;
  const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (days[month - 1] ?? 0);
}

export const mexicanRfcSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(value) && validRfcDate(value), {
    message: 'RFC mexicano inválido',
  });

export const createTaxProfileSchema = z.object({
  rfc: mexicanRfcSchema,
  legalName: z.string().trim().min(1),
  postalCode: z.string().trim().regex(/^\d{5}$/, 'El código postal debe tener 5 dígitos').optional(),
  taxRegime: z.string().trim().min(1).optional(),
  cfdiUse: z.string().trim().min(1).optional(),
  billingEmail: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
});

export type CreateTaxProfileDto = z.infer<typeof createTaxProfileSchema>;
