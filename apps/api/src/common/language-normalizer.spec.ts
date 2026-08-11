import { describe, expect, it } from 'vitest';
import { LanguageNormalizer } from './language-normalizer';

describe('LanguageNormalizer', () => {
  const normalizer = new LanguageNormalizer();

  it.each([
    ['compre gasolin por 850', 'compré gasolina por 850'],
    ['pague 1,200 eftivo', 'pagué 1200 efectivo'],
    ['costko 980 deboto', 'Costco 980 débito'],
    ['no fueron 850 eran 820', 'no fueron 850 eran 820'],
    ['cancela ese gato', 'cancela ese gasto'],
  ])('normalizes %s safely', (original, expected) => {
    expect(normalizer.normalize(original).normalizedText).toBe(expected);
  });

  it('uses active expense context without changing names or numbers', () => {
    const result = normalizer.normalize('gato jzm 850 tarjeta 1234', {
      activeExpenseConversation: true,
    });
    expect(result.normalizedText).toBe('gasto jzm 850 tarjeta 1234');
    expect(result.originalText).toBe('gato jzm 850 tarjeta 1234');
  });

  it('keeps ambiguous text unchanged', () => {
    expect(normalizer.normalize('compré algo').normalizedText).toBe('compré algo');
    expect(normalizer.normalize('gato jzm').normalizedText).toBe('gato jzm');
  });
});
