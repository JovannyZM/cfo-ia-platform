import { describe, expect, it } from 'vitest';
import { LanguageNormalizer } from '../common/language-normalizer';
import { parseExpenseText } from './expense-text-parser';

describe('parseExpenseText compact phrases', () => {
  const normalizer = new LanguageNormalizer();

  it.each([
    ['gasolin 850 lo hice jzm en ejectivo', 'gasolina', '850', 'JZM', 'CASH'],
    ['cafe 380 lo pago ana con deboto', 'cafe', '380', 'Ana', 'DEBIT_CARD'],
    ['estacionamiento 120 por jzm en eftivo', 'estacionamiento', '120', 'JZM', 'CASH'],
    ['gasolin 850 lo hizo jzm en efectivo', 'gasolina', '850', 'JZM', 'CASH'],
    ['cafe 380 lo realizo ana con debito', 'cafe', '380', 'Ana', 'DEBIT_CARD'],
    ['estacionamiento 120 lo pago carlos en efectivo', 'estacionamiento', '120', 'Carlos', 'CASH'],
    ['compras 900 fue de mi esposa con credito', 'compras', '900', 'Mi esposa', 'CREDIT_CARD'],
  ])('extracts %s', (originalText, concept, amount, spender, paymentMethod) => {
    const normalizedText = normalizer.normalize(originalText).normalizedText;
    expect(parseExpenseText({ originalText, normalizedText })).toMatchObject({
      merchantName: concept,
      originalAmount: amount,
      spenderName: spender,
      paymentMethod,
    });
  });

  it('preserves generic source context', () => {
    expect(parseExpenseText({
      originalText: 'cafe 100', normalizedText: 'cafe 100',
      sourceChannel: 'TELEGRAM', sourceConversationId: 'conversation-id',
    })).toMatchObject({ sourceChannel: 'TELEGRAM', sourceConversationId: 'conversation-id' });
  });

  it('parses a natural transfer expense using paguÃ©', () => {
    const text = 'Pagu\u00e9 369 a la maestra, lo hizo Esli por transferencia.';
    expect(parseExpenseText({ originalText: text, normalizedText: text })).toMatchObject({
      merchantName: 'maestra',
      originalAmount: '369',
      spenderName: 'Esli',
      paymentMethod: 'TRANSFER',
    });
  });

  it.each([
    ['Pagu\u00e9 369 a la miss Adri', 'miss Adri'],
    ['Pagu\u00e9 500 a Miss Tere', 'Miss Tere'],
    ['Pagu\u00e9 900 al maestro de piano', 'maestro de piano'],
    ['Pagu\u00e9 450 a la miss de arte', 'miss de arte'],
  ])('preserves the specific class detail from %s', (text, detail) => {
    expect(parseExpenseText({ originalText: text, normalizedText: text })).toMatchObject({
      merchantName: detail,
      description: detail,
    });
  });

  it.each([
    ['gaste 300 en gasolina', 'gasolina'],
    ['compre en el super por 850', 'supermercado'],
    ['pague uniforme juan 1200', 'uniforme juan'],
    ['gaste 250 en estacionamiento', 'estacionamiento'],
    ['compre cafe para la oficina por 380', 'cafe para la oficina'],
  ])('extracts a useful concept from %s', (originalText, concept) => {
    const normalizedText = normalizer.normalize(originalText).normalizedText;
    expect(parseExpenseText({ originalText, normalizedText })).toMatchObject({
      merchantName: concept, description: concept,
    });
  });

  it.each(['gasté 300', 'pagué 300', 'compré 300']) (
    'never uses the operation verb as the concept: %s',
    (text) => {
      const parsed = parseExpenseText({ originalText: text, normalizedText: text });
      expect(parsed.merchantName).toBeUndefined();
      expect(parsed.description).toBeUndefined();
    },
  );
});
