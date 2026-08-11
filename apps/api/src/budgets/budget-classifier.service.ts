import { Injectable } from '@nestjs/common';
import { BudgetRuleType, type Budget, type BudgetMatchingRule } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export interface StructuredExpenseForBudget {
  readonly explicitBudgetName?: string | null;
  readonly merchantName?: string | null;
  readonly description?: string | null;
  readonly category?: string | null;
}

export interface BudgetClassificationResult {
  readonly budgetId: string | null;
  readonly confidence: number;
  readonly matchedRule: {
    readonly id: string | null;
    readonly ruleType: BudgetRuleType | 'EXPLICIT_BUDGET';
    readonly value: string;
  } | null;
  readonly reason: string;
  readonly ambiguous: boolean;
}

type BudgetWithRules = Budget & { matchingRules: BudgetMatchingRule[] };

export function normalizeBudgetText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

@Injectable()
export class BudgetClassifierService {
  constructor(private readonly prisma: PrismaService) {}

  async classify(
    workspaceId: string,
    expense: StructuredExpenseForBudget,
  ): Promise<BudgetClassificationResult> {
    const budgets = await this.prisma.budget.findMany({
      where: { workspaceId, active: true },
      include: { matchingRules: { where: { active: true } } },
    });

    const explicit = normalizeOptional(expense.explicitBudgetName);
    if (explicit) {
      const selected = budgets.filter(({ name }) => normalizeBudgetText(name) === explicit);
      if (selected.length === 1) {
        return {
          budgetId: selected[0]!.id,
          confidence: 1,
          matchedRule: {
            id: null,
            ruleType: 'EXPLICIT_BUDGET',
            value: expense.explicitBudgetName!.trim(),
          },
          reason: 'El usuario indicó explícitamente el presupuesto.',
          ambiguous: false,
        };
      }
      if (selected.length > 1) return ambiguousResult('Más de un presupuesto coincide con el nombre explícito.');
    }

    const matches = budgets.flatMap((budget) => this.matchBudget(budget, expense));
    if (matches.length === 0) return noMatchResult();

    const highestPriority = Math.max(...matches.map(({ priority }) => priority));
    const topMatches = matches.filter(({ priority }) => priority === highestPriority);
    const budgetIds = [...new Set(topMatches.map(({ budget }) => budget.id))];
    if (budgetIds.length !== 1) {
      return ambiguousResult('Existen varias coincidencias con la misma prioridad.');
    }

    const winner = topMatches[0]!;
    return {
      budgetId: winner.budget.id,
      confidence: confidenceFor(winner.rule.ruleType),
      matchedRule: {
        id: winner.rule.id,
        ruleType: winner.rule.ruleType,
        value: winner.rule.value,
      },
      reason: reasonFor(winner.rule.ruleType),
      ambiguous: false,
    };
  }

  private matchBudget(budget: BudgetWithRules, expense: StructuredExpenseForBudget) {
    const merchant = normalizeOptional(expense.merchantName);
    const description = normalizeOptional(expense.description);
    const category = normalizeOptional(expense.category);
    const generalText = [merchant, description, category].filter(Boolean).join(' ');

    return budget.matchingRules
      .filter((rule) => {
        const expected = rule.normalizedValue;
        switch (rule.ruleType) {
          case BudgetRuleType.EXPLICIT_ALIAS:
          case BudgetRuleType.KEYWORD:
            return containsTerm(generalText, expected);
          case BudgetRuleType.MERCHANT_NAME:
            return containsTerm(merchant, expected);
          case BudgetRuleType.EXPENSE_CATEGORY:
            return containsTerm(category, expected);
        }
      })
      .map((rule) => ({ budget, rule, priority: rule.priority }));
  }
}

function normalizeOptional(value: string | null | undefined): string {
  return value ? normalizeBudgetText(value) : '';
}

function containsTerm(source: string, expected: string): boolean {
  if (!source || !expected) return false;
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^A-Z0-9])${escaped}(?:$|[^A-Z0-9])`).test(source);
}

function confidenceFor(type: BudgetRuleType): number {
  return {
    [BudgetRuleType.EXPLICIT_ALIAS]: 0.98,
    [BudgetRuleType.KEYWORD]: 0.9,
    [BudgetRuleType.MERCHANT_NAME]: 0.85,
    [BudgetRuleType.EXPENSE_CATEGORY]: 0.75,
  }[type];
}

function reasonFor(type: BudgetRuleType): string {
  return {
    [BudgetRuleType.EXPLICIT_ALIAS]: 'Coincidió un alias explícito.',
    [BudgetRuleType.KEYWORD]: 'Coincidió una regla específica conocida.',
    [BudgetRuleType.MERCHANT_NAME]: 'Coincidió el comercio o proveedor.',
    [BudgetRuleType.EXPENSE_CATEGORY]: 'Coincidió la categoría general.',
  }[type];
}

function ambiguousResult(reason: string): BudgetClassificationResult {
  return { budgetId: null, confidence: 0, matchedRule: null, reason, ambiguous: true };
}

function noMatchResult(): BudgetClassificationResult {
  return {
    budgetId: null,
    confidence: 0,
    matchedRule: null,
    reason: 'No existe una regla suficientemente clara.',
    ambiguous: false,
  };
}
