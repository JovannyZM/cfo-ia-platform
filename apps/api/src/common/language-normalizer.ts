import { Injectable } from '@nestjs/common';
import { normalizePaymentMethodText } from './payment-method-normalizer';

export interface LanguageNormalizationContext {
  readonly activeExpenseConversation: boolean;
}

export interface LanguageNormalizationResult {
  readonly originalText: string;
  readonly normalizedText: string;
  readonly confidence: number;
  readonly changesApplied: readonly string[];
}

const REPLACEMENTS: readonly [RegExp, string, string][] = [
  [/\bcompre\b/giu, 'compré', 'compre→compré'],
  [/\bgasolin\b/giu, 'gasolina', 'gasolin→gasolina'],
  [/\bpague\b/giu, 'pagué', 'pague→pagué'],
  [/\bcostko\b/giu, 'Costco', 'costko→Costco'],
];

@Injectable()
export class LanguageNormalizer {
  normalize(
    originalText: string,
    context: LanguageNormalizationContext = { activeExpenseConversation: false },
  ): LanguageNormalizationResult {
    try {
      let normalizedText = originalText.trim();
      const changesApplied: string[] = [];
      for (const [pattern, replacement, change] of REPLACEMENTS) {
        const next = normalizedText.replace(pattern, replacement);
        if (next !== normalizedText) changesApplied.push(change);
        normalizedText = next;
      }
      const paymentMethod = normalizePaymentMethodText(normalizedText);
      normalizedText = paymentMethod.text;
      changesApplied.push(...paymentMethod.changesApplied);
      if (context.activeExpenseConversation || /\bcancela ese gato\b/iu.test(normalizedText)) {
        const next = normalizedText.replace(/\bgato\b/giu, 'gasto');
        if (next !== normalizedText) changesApplied.push('gato→gasto (contexto de gasto)');
        normalizedText = next;
      }
      normalizedText = normalizedText.replace(
        /\b(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)\b/g,
        (value) => {
          changesApplied.push(`${value}→${value.replace(/,/g, '')}`);
          return value.replace(/,/g, '');
        },
      );
      return {
        originalText,
        normalizedText,
        confidence: changesApplied.length ? 0.96 : 1,
        changesApplied,
      };
    } catch {
      return { originalText, normalizedText: originalText, confidence: 0, changesApplied: [] };
    }
  }
}
