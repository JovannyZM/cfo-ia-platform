import {
  BudgetNature,
  BudgetPeriod,
  BudgetRuleType,
  Prisma,
  type Budget,
  type BudgetMatchingRule,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma.service';
import { BudgetClassifierService, normalizeBudgetText } from './budget-classifier.service';

const workspaceId = '00000000-0000-4000-8000-000000000007';

function budget(
  id: string,
  name: string,
  rules: ReadonlyArray<{ type: BudgetRuleType; value: string; priority: number }>,
): Budget & { matchingRules: BudgetMatchingRule[] } {
  const now = new Date('2026-08-01T00:00:00.000Z');
  const base: Budget = {
    id,
    workspaceId,
    name,
    amount: new Prisma.Decimal(1000),
    currency: 'MXN',
    period: BudgetPeriod.MONTHLY,
    nature: BudgetNature.EXPENSE,
    startDate: now,
    endDate: null,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...base,
    matchingRules: rules.map((rule, index) => ({
      id: `${id}-${index}`,
      budgetId: id,
      ruleType: rule.type,
      value: rule.value,
      normalizedValue: normalizeBudgetText(rule.value),
      priority: rule.priority,
      active: true,
      createdAt: now,
      updatedAt: now,
    })),
  };
}

function classifier(budgets: ReturnType<typeof budget>[]) {
  const expenseUpdate = vi.fn();
  const prisma = {
    budget: { findMany: vi.fn().mockResolvedValue(budgets) },
    expense: { update: expenseUpdate },
  } as unknown as PrismaService;
  return { service: new BudgetClassifierService(prisma), expenseUpdate };
}

describe('BudgetClassifierService', () => {
  it('classifies by an explicit budget selected by the user before any rule', async () => {
    const disney = budget('disney', 'DISNEY', [{ type: BudgetRuleType.EXPLICIT_ALIAS, value: 'DISNEY', priority: 500 }]);
    const result = await classifier([disney]).service.classify(workspaceId, {
      explicitBudgetName: ' disney ', merchantName: 'Costco', category: 'Supermercado',
    });
    expect(result).toMatchObject({ budgetId: 'disney', confidence: 1, ambiguous: false });
  });

  it('classifies by merchant case-, accent- and whitespace-insensitively', async () => {
    const luz = budget('luz', 'Luz', [{ type: BudgetRuleType.MERCHANT_NAME, value: 'CFE', priority: 300 }]);
    const result = await classifier([luz]).service.classify(workspaceId, { merchantName: '  cfe  ' });
    expect(result.budgetId).toBe('luz');
  });

  it('prioritizes Cumple Esli over Liverpool', async () => {
    const cumple = budget('cumple', 'Cumple Esli', [{ type: BudgetRuleType.EXPLICIT_ALIAS, value: 'CUMPLEAÑOS ESLI', priority: 500 }]);
    const otros = budget('otros', 'Otros', [{ type: BudgetRuleType.EXPENSE_CATEGORY, value: 'LIVERPOOL', priority: 100 }]);
    const result = await classifier([cumple, otros]).service.classify(workspaceId, {
      description: 'Regalo cumpleaños Esli', category: 'Liverpool',
    });
    expect(result.budgetId).toBe('cumple');
  });

  it('prioritizes DISNEY over Costco and Otras APP', async () => {
    const disney = budget('disney', 'DISNEY', [{ type: BudgetRuleType.EXPLICIT_ALIAS, value: 'DISNEY', priority: 500 }]);
    const superBudget = budget('super', 'Super', [{ type: BudgetRuleType.MERCHANT_NAME, value: 'COSTCO', priority: 300 }]);
    const apps = budget('apps', 'Otras APP', [{ type: BudgetRuleType.MERCHANT_NAME, value: 'DISNEY', priority: 300 }]);
    const result = await classifier([disney, superBudget, apps]).service.classify(workspaceId, {
      merchantName: 'Costco', description: 'Viaje Disney',
    });
    expect(result.budgetId).toBe('disney');
  });

  it.each([
    ['NETFLIX', 'netflix', BudgetRuleType.MERCHANT_NAME, { merchantName: 'NETFLIX' }],
    ['CFE', 'luz', BudgetRuleType.MERCHANT_NAME, { merchantName: 'CFE' }],
    ['MOUNJARO', 'mounjaro', BudgetRuleType.KEYWORD, { description: 'Mounjaro mensual' }],
  ])('classifies %s into its specific budget', async (value, expectedId, type, expense) => {
    const target = budget(expectedId, expectedId, [{ type, value, priority: type === BudgetRuleType.KEYWORD ? 400 : 300 }]);
    expect((await classifier([target]).service.classify(workspaceId, expense)).budgetId).toBe(expectedId);
  });

  it('returns ambiguity for TELCEL shared by Cel Esli and Cel JZM', async () => {
    const esli = budget('esli', 'Cel Esli', [{ type: BudgetRuleType.MERCHANT_NAME, value: 'TELCEL', priority: 300 }]);
    const jzm = budget('jzm', 'Cel JZM', [{ type: BudgetRuleType.MERCHANT_NAME, value: 'TELCEL', priority: 300 }]);
    const result = await classifier([esli, jzm]).service.classify(workspaceId, { merchantName: 'Telcel' });
    expect(result).toEqual(expect.objectContaining({ budgetId: null, ambiguous: true }));
  });

  it('does not classify a gas station as JZM viático without travel context', async () => {
    const householdGas = budget('gas', 'Gas', [{ type: BudgetRuleType.KEYWORD, value: 'GAS', priority: 400 }]);
    const gas = budget('gasolina', 'Gasolina', [{ type: BudgetRuleType.EXPENSE_CATEGORY, value: 'GASOLINERIAS', priority: 200 }]);
    const travel = budget('viatico', 'JZM viático', [{ type: BudgetRuleType.KEYWORD, value: 'GASOLINERIAS FUERA DE XALAPA', priority: 400 }]);
    const result = await classifier([householdGas, gas, travel]).service.classify(workspaceId, {
      merchantName: 'Gasolinera Pemex', category: 'Gasolinerias',
    });
    expect(result.budgetId).toBe('gasolina');
  });

  it('does not let Otros beat a more specific rule and never modifies Expense', async () => {
    const mounjaro = budget('mounjaro', 'Mounjaro', [{ type: BudgetRuleType.KEYWORD, value: 'MOUNJARO', priority: 400 }]);
    const otros = budget('otros', 'Otros', [{ type: BudgetRuleType.EXPENSE_CATEGORY, value: 'FARMACIA', priority: 100 }]);
    const { service, expenseUpdate } = classifier([mounjaro, otros]);
    const result = await service.classify(workspaceId, { description: 'Mounjaro', category: 'Farmacia' });
    expect(result.budgetId).toBe('mounjaro');
    expect(expenseUpdate).not.toHaveBeenCalled();
  });

  it('returns null and does not fall back to Otros without a matching rule', async () => {
    const otros = budget('otros', 'Otros', [{ type: BudgetRuleType.EXPENSE_CATEGORY, value: 'PAPELERIA', priority: 100 }]);
    const result = await classifier([otros]).service.classify(workspaceId, { description: 'Sin clasificación' });
    expect(result).toEqual(expect.objectContaining({ budgetId: null, ambiguous: false }));
  });

  it.each(['Miss Adri', 'Miss Tere', 'Maestro de piano', 'Miss de arte'])(
    'classifies %s into Clases while preserving the source detail',
    async (description) => {
      const clases = budget('clases', 'Clases', [
        { type: BudgetRuleType.KEYWORD, value: 'MISS', priority: 400 },
        { type: BudgetRuleType.KEYWORD, value: 'MAESTRO', priority: 400 },
        { type: BudgetRuleType.KEYWORD, value: 'MAESTRA', priority: 400 },
        { type: BudgetRuleType.KEYWORD, value: 'CLASE', priority: 400 },
        { type: BudgetRuleType.KEYWORD, value: 'CLASES', priority: 400 },
      ]);
      const result = await classifier([clases]).service.classify(workspaceId, { description });
      expect(result).toMatchObject({ budgetId: 'clases', ambiguous: false });
      expect(description).not.toBe(clases.name);
    },
  );
});
