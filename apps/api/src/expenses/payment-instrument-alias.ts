export interface AliasedPaymentInstrument {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly last4: string | null;
  readonly holderName: string;
  readonly aliases: readonly string[];
}

export function findPaymentInstrumentByAlias(
  text: string,
  instruments: readonly AliasedPaymentInstrument[],
): AliasedPaymentInstrument | undefined {
  const normalizedText = ` ${normalizeAlias(text)} `;
  return instruments
    .flatMap((instrument) => instrument.aliases.map((alias) => ({
      instrument,
      alias: normalizeAlias(alias),
    })))
    .filter(({ alias }) => alias.length > 0 && normalizedText.includes(` ${alias} `))
    .sort((left, right) => right.alias.length - left.alias.length)[0]?.instrument;
}

export function paymentMethodFromInstrumentType(type: string): string | undefined {
  const normalized = normalizeAlias(type).replace(/ /gu, '_').toUpperCase();
  if (normalized === 'CREDIT_CARD') return 'CREDIT_CARD';
  if (normalized === 'DEBIT_CARD') return 'DEBIT_CARD';
  return undefined;
}

function normalizeAlias(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-MX')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}
