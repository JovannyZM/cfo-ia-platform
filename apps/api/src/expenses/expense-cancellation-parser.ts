import { parseMexicanMoney } from './mexican-money';

export interface ExpenseCancellationCriteria {
  readonly query?: string;
  readonly amount?: string;
  readonly spenderName?: string;
  readonly paymentMethod?: string;
  readonly occurredOn?: string;
}

const PAYMENT_WORDS = 'efectivo|debito|credito|transferencia|tarjeta|cheque';
const PERSON_ACTIONS = 'hizo|realizo|pago|gasto';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/hixo|hiso/gu, 'hizo')
    .replace(/(\d)([a-z])/gu, '$1 $2')
    .replace(/([a-z])(\d)/gu, '$1 $2')
    .replace(/[^a-z0-9$.,/\-\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function parseExpenseCancellation(
  text: string,
): ExpenseCancellationCriteria | undefined {
  let normalized = normalize(text);
  if (/^ese gasto esta mal,?\s+cancelalo$/u.test(normalized)) return {};
  const prefix = normalized.match(
    /^(?:cancela(?:r)?|anula(?:r)?|quiero cancelar)\b\s*(.*)$/u,
  );
  if (!prefix?.[1]) return undefined;
  normalized = prefix[1].trim();
  if (/^(?:(?:el|la)\s+)?(?:conversacion|sesion|operacion)$/u.test(normalized)) {
    return undefined;
  }

  let working = normalized;
  const occurredMatch = working.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/u);
  const occurredOn = occurredMatch
    ? `${occurredMatch[3]}-${occurredMatch[2]!.padStart(2, '0')}-${occurredMatch[1]!.padStart(2, '0')}`
    : undefined;
  if (occurredMatch) working = working.replace(occurredMatch[0], ' ');

  const amountPattern = /(?:\$\s*)?(?:\d{1,3}(?:[ ,]\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/u;
  const amountMatch = working.match(amountPattern);
  const amount = amountMatch ? parseMexicanMoney(amountMatch[0]) : undefined;

  const actionPerson = working.match(
    new RegExp(`\\bque\\s+(?:${PERSON_ACTIONS})\\s+(?!(?:en|con|por)\\b)([a-z][a-z0-9]*(?:\\s+[a-z][a-z0-9]*){0,2}?)(?=\\s+(?:en|con|por)\\s+(?:${PAYMENT_WORDS})|$)`, 'u'),
  );
  const amountPerson = working.match(
    new RegExp(`${amountPattern.source}\\s+de\\s+([a-z][a-z0-9]*(?:\\s+[a-z][a-z0-9]*){0,2}?)(?=\\s+que\\s+(?:${PERSON_ACTIONS})|\\s+(?:en|con)\\s+(?:${PAYMENT_WORDS})|$)`, 'u'),
  );
  const paidByPerson = working.match(
    new RegExp(`\\bpagad[oa]\\s+por\\s+([a-z][a-z0-9]*(?:\\s+[a-z][a-z0-9]*){0,2}?)(?=\\s+(?:en|con)\\s+(?:${PAYMENT_WORDS})|$)`, 'u'),
  );
  const spenderName = (
    actionPerson?.[1] ?? amountPerson?.[1] ?? paidByPerson?.[1]
  )?.trim();

  const paymentMethod = /\befectivo\b/u.test(working)
    ? 'CASH'
    : /\bdebito\b/u.test(working)
      ? 'DEBIT_CARD'
      : /\bcredito\b/u.test(working)
        ? 'CREDIT_CARD'
        : /\btransferencia\b/u.test(working)
          ? 'TRANSFER'
          : /\bcheque\b/u.test(working)
            ? 'CHECK'
            : undefined;

  if (spenderName) {
    const escapedName = escapeRegex(spenderName);
    working = working
      .replace(new RegExp(`\\bque\\s+(?:${PERSON_ACTIONS})\\s+${escapedName}\\b`, 'gu'), ' ')
      .replace(new RegExp(`\\bde\\s+${escapedName}\\s+que\\s+(?:${PERSON_ACTIONS})\\b`, 'gu'), ' ')
      .replace(new RegExp(`\\bde\\s+${escapedName}\\b(?=\\s+que\\s+(?:${PERSON_ACTIONS})|$)`, 'gu'), ' ')
      .replace(new RegExp(`\\bpagad[oa]\\s+por\\s+${escapedName}\\b`, 'gu'), ' ');
  }
  if (amountMatch) working = working.replace(amountMatch[0], ' ');
  working = working
    .replace(new RegExp(`\\b(?:pagad[oa]\\s+)?(?:en|con|por)?\\s*(?:${PAYMENT_WORDS})\\b`, 'gu'), ' ')
    .replace(/\b(?:el|la|los|las|un|una|ese|gasto|compra|ultimo|anterior|de|por|que|hizo|realizo|pago|gasto|pagado|pagada)\b/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  return {
    ...(working ? { query: working } : {}),
    ...(amount ? { amount } : {}),
    ...(spenderName ? { spenderName } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(occurredOn ? { occurredOn } : {}),
  };
}

export function isLastExpenseCancellation(text: string): boolean {
  return parseExpenseCancellation(text) !== undefined;
}
