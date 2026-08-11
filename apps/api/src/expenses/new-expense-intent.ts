const NEW_EXPENSE_VERBS = new Set([
  'gaste', 'gasto', 'pague', 'compre', 'pagamos', 'compramos', 'pago',
  'liquide', 'abone', 'transferi', 'deposite',
]);

export function isNewExpenseIntent(text: string): boolean {
  return firstOperation(text) !== undefined;
}

export function stripNewExpenseOperation(text: string): string {
  const operation = firstOperation(text);
  if (!operation) return text.trim();
  return text.slice(operation.end).replace(/^[\s,.:;!?\u00a1\u00bf-]+/u, '').trim();
}

function firstOperation(text: string): { readonly end: number } | undefined {
  let offset = text.match(/^\s*/u)?.[0].length ?? 0;
  offset += text.slice(offset).match(/^[\u00a1\u00bf,.:;!?-]*/u)?.[0].length ?? 0;
  const first = text.slice(offset).match(/^\p{L}+/u);
  if (!first) return undefined;
  if (normalizeWord(first[0]) === 'yo') {
    offset += first[0].length;
    offset += text.slice(offset).match(/^[\s,.:;!?\u00a1\u00bf-]*/u)?.[0].length ?? 0;
  }
  const verb = text.slice(offset).match(/^\p{L}+/u);
  if (!verb || !NEW_EXPENSE_VERBS.has(normalizeWord(verb[0]))) return undefined;
  const end = offset + verb[0].length;
  if (end < text.length && /[\p{L}\p{N}]/u.test(text[end]!)) return undefined;
  return { end };
}

function normalizeWord(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es-MX');
}
