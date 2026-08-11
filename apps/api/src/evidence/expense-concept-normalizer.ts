const GENERIC_DESCRIPTION =
  /^(?:\d+\s+)?(?:art[ií]culos?|productos?)$|^compra de (?:art[ií]culos?|productos?)$|^(?:compr[eé]|gast[eé]|pagu[eé])$/iu;

export function usefulExpenseDescription(
  merchantName: string,
  description: string | null,
  category: string | null,
): string {
  if (description && !GENERIC_DESCRIPTION.test(description.trim())) {
    return description.trim();
  }

  if (/costco|walmart|sam'?s/iu.test(merchantName)) return 'Compra de supermercado';
  if (/gasolin|combustible/iu.test(`${merchantName} ${category ?? ''}`)) return 'Gasolina';
  if (/restaurante|restaurant/iu.test(`${merchantName} ${category ?? ''}`)) {
    return 'Consumo en restaurante';
  }

  return merchantName.trim();
}
