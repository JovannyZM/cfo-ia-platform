export interface PaymentMethodNormalizationResult {
  readonly text: string;
  readonly changesApplied: readonly string[];
}

const PAYMENT_METHOD_VARIANTS: Readonly<Record<string, string>> = {
  efectivo: 'efectivo',
  ejectivo: 'efectivo',
  efetivo: 'efectivo',
  eftivo: 'efectivo',
  debito: 'débito',
  deboto: 'débito',
  credito: 'crédito',
  transferencia: 'transferencia',
  trasferencia: 'transferencia',
  transferensia: 'transferencia',
  tarjeta: 'tarjeta',
  cheque: 'cheque',
};

function comparable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-MX');
}

export function normalizePaymentMethodText(
  input: string,
): PaymentMethodNormalizationResult {
  const changesApplied: string[] = [];
  const trimmed = input.trim().replace(/\s+/g, ' ');
  const text = trimmed.replace(/\p{L}+/gu, (word) => {
    const replacement = PAYMENT_METHOD_VARIANTS[comparable(word)];
    if (!replacement || replacement === word) return word;
    changesApplied.push(`${word}→${replacement}`);
    return replacement;
  });
  if (trimmed !== input && !changesApplied.includes('espacios normalizados')) {
    changesApplied.push('espacios normalizados');
  }
  return { text, changesApplied };
}
