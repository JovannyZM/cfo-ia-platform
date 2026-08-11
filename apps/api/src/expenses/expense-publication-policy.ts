export const EXPENSE_CORRECTION_NOT_ALLOWED_MESSAGE =
  'No puedo modificar un gasto ya registrado. Debes cancelarlo y registrar uno nuevo.' as const;

const CORRECTION_INTENT_PATTERNS = [
  /\bno\s+(?:fueron|fue|era|eran)\b.+\b(?:fueron|fue|era|eran)\b/iu,
  /\ben realidad\s+(?:fueron|fue|era|eran)\b/iu,
  /\bme\s+equivoqu[eé](?:\s|,)/iu,
  /\bcorrige(?:lo)?\s+a\b/iu,
  /\b(?:monto|importe|concepto|comercio|responsable|m[eé]todo|instrumento|categor[ií]a|fecha|moneda)\s+correct[oa]\s+es\b/iu,
  /\bno\s+lo\s+(?:hizo|realiz[oó]|pag[oó]|gast[oó])\b.+\b(?:lo\s+)?(?:hizo|realiz[oó]|pag[oó]|gast[oó])\b/iu,
] as const;

export function isPublishedExpenseCorrection(text: string): boolean {
  return CORRECTION_INTENT_PATTERNS.some((pattern) => pattern.test(text));
}
