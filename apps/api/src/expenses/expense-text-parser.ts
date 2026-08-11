import type { ExpenseTextReceivedPayload } from '@cfo-ia/domain';
import { parseMexicanMoney } from './mexican-money';
import { stripNewExpenseOperation } from './new-expense-intent';

export function parseExpenseText(payload: ExpenseTextReceivedPayload) {
  const text = payload.normalizedText.trim();
  const amount = parseMexicanMoney(text);
  const namedSpender = extractSpender(text);
  const paidTo = text.match(/le pagu[eé] a\s+([^\d,.]+)/iu)?.[1]?.trim();
  const spenderName = normalizePersonName(namedSpender ?? paidTo) ??
    (/\byo\b|\bmi\b/iu.test(text) ? payload.telegramUserName : undefined);
  const paymentMethod = /efectivo/iu.test(text)
    ? 'CASH'
    : /d[eé]bito/iu.test(text)
      ? 'DEBIT_CARD'
      : /cr[eé]dito|tarjeta/iu.test(text)
        ? 'CREDIT_CARD'
        : /transferencia/iu.test(text)
          ? 'TRANSFER'
          : /cheque/iu.test(text)
            ? 'CHECK'
            : undefined;
  const concept = extractConcept(text);
  return {
    merchantName: concept,
    description: concept,
    occurredAt: new Date().toISOString(),
    originalAmount: amount,
    originalCurrency: 'MXN',
    inputSource: 'TEXT' as const,
    ...(payload.sourceChannel ? { sourceChannel: payload.sourceChannel } : {}),
    ...(payload.sourceConversationId ? { sourceConversationId: payload.sourceConversationId } : {}),
    ...(payload.userId ? { requestedByUserId: payload.userId } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(spenderName ? { spenderName } : {}),
  };
}

const AMOUNT = /\$?\s*(?:\d{1,3}(?:[, ]\d{3})+|\d+)(?:\.\d{1,2})?/u;

function extractConcept(text: string): string | undefined {
  const amountMatch = AMOUNT.exec(text);
  const beforeAmount = amountMatch ? text.slice(0, amountMatch.index) : text;
  const afterAmount = amountMatch
    ? text.slice(amountMatch.index + amountMatch[0].length)
    : '';
  const beforeWithoutOperation = stripNewExpenseOperation(beforeAmount);
  const source = beforeWithoutOperation || afterAmount;
  const concept = source
    .replace(/^\s*(?:a\s+la|a\s+el|al)\s+/iu, '')
    .replace(/^\s*a\s+/iu, '')
    .replace(/^\s*en\s+(?:el|la)\s+/iu, '')
    .replace(/^\s*en\s+/iu, '')
    .replace(/\s+por\s*$/iu, '')
    .replace(/\s*,?\s*lo\s+(?:hice|hizo|realizo|realizó|pago|pagó|gasto|gastó)\b.*$/iu, '')
    .replace(/\s+(?:en|con)\s+(?:efectivo|tarjeta|d[eé]bito|cr[eé]dito)\b.*$/iu, '')
    .replace(/\s+por\s+transferencia\b.*$/iu, '')
    .replace(/[,.!?]+$/u, '')
    .trim();
  if (!concept) return undefined;
  return /^(?:s[uú]per|supermercado)$/iu.test(concept) ? 'supermercado' : concept;
}

function extractSpender(text: string): string | undefined {
  return text.match(
    /(?:\blo\s+(?:hice|hizo|realizo|realizó|pago|pagó|gasto|gastó)|\bfue(?:\s+de)?|\bpor)\s+(?!\d)(.+?)(?=\s+(?:en|con)\s+(?:efectivo|tarjeta|d[eé]bito|cr[eé]dito)|\s+por\s+transferencia|[,.!?]|$)/iu,
  )?.[1]?.trim();
}

function normalizePersonName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/[.,!?]+$/u, '');
  if (/^[^aeiouáéíóú]+$/iu.test(trimmed)) return trimmed.toLocaleUpperCase('es-MX');
  return trimmed.charAt(0).toLocaleUpperCase('es-MX') + trimmed.slice(1);
}
