export function parseMexicanMoney(text: string): string | undefined {
  const matches = Array.from(
    text.matchAll(/\$?\s*(\d{1,3}(?:[, ]\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g),
  );
  return matches.at(-1)?.[1]?.replace(/[, ]/g, '');
}
