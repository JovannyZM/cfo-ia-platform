import {
  AccountRole,
  BudgetNature,
  BudgetPeriod,
  BudgetRuleType,
  PlatformRole,
  PrismaClient,
  SubscriptionStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

const IDS = {
  admin: '00000000-0000-4000-8000-000000000001',
  owner: '00000000-0000-4000-8000-000000000002',
  account: '00000000-0000-4000-8000-000000000003',
  membership: '00000000-0000-4000-8000-000000000004',
  subscription: '00000000-0000-4000-8000-000000000005',
  request: '00000000-0000-4000-8000-000000000006',
  workspace: '00000000-0000-4000-8000-000000000007',
  amexAeromexico: '00000000-0000-4000-8000-000000000008',
  bbvaInfinite: '00000000-0000-4000-8000-000000000009',
  costcoInvoiceProfile: '00000000-0000-4000-8000-000000000010',
  chedrauiInvoiceProfile: '00000000-0000-4000-8000-000000000011',
};

type SeedBudget = {
  name: string;
  amount: string;
  period: BudgetPeriod;
  nature: BudgetNature;
  rules: ReadonlyArray<{ type: BudgetRuleType; value: string }>;
};

const merchantRules = (...values: string[]) =>
  values.map((value) => ({ type: BudgetRuleType.MERCHANT_NAME, value }));
const keywordRules = (...values: string[]) =>
  values.map((value) => ({ type: BudgetRuleType.KEYWORD, value }));
const categoryRules = (...values: string[]) =>
  values.map((value) => ({ type: BudgetRuleType.EXPENSE_CATEGORY, value }));
const aliasRules = (...values: string[]) =>
  values.map((value) => ({ type: BudgetRuleType.EXPLICIT_ALIAS, value }));

const BUDGETS: readonly SeedBudget[] = [
  { name: 'Telefono', amount: '600', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: merchantRules('TELMEX') },
  { name: 'Muchacha', amount: '18000', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: keywordRules('NOMINA MUCHACHAS') },
  { name: 'Gas', amount: '1500', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: keywordRules('GAS') },
  { name: 'Luz', amount: '1500', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: merchantRules('CFE') },
  { name: 'Super', amount: '18000', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: merchantRules('COSTCO', 'CHEDRAUI', 'WALMART', 'SORIANA') },
  { name: 'Colegiatura', amount: '12000', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: keywordRules('COLEGIO') },
  { name: 'Taller', amount: '3000', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: keywordRules('GIMNASIA', 'SOCCER', 'TENNIS', 'NATACIÓN') },
  { name: 'Café escuela', amount: '2000', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: keywordRules('CAFETERIA ESCUELA') },
  { name: 'Cel Esli', amount: '600', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: merchantRules('TELCEL', 'MOVISTAR') },
  { name: 'Cel JZM', amount: '600', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: merchantRules('TELCEL', 'MOVISTAR') },
  { name: 'Netflix', amount: '600', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: merchantRules('NETFLIX', 'NETFLIZ') },
  { name: 'Otras APP', amount: '800', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: merchantRules('ZING', 'DISNEY', 'HBO') },
  { name: 'Gasolina', amount: '6000', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: categoryRules('GASOLINERIAS') },
  { name: 'JZM viático', amount: '10000', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: keywordRules('CASETAS', 'GASOLINERIAS FUERA DE XALAPA') },
  { name: 'Ahorro', amount: '5000', period: BudgetPeriod.MONTHLY, nature: BudgetNature.SAVING, rules: keywordRules('CETES', 'FONDOS DE BBVA') },
  { name: 'Inversión', amount: '5000', period: BudgetPeriod.MONTHLY, nature: BudgetNature.INVESTMENT, rules: keywordRules('ETF', 'GBM') },
  { name: 'Salidas', amount: '8000', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: categoryRules('RESTAURANTES', 'CINE', 'CAFETERIAS', 'ESTACIONAMIENTOS') },
  { name: 'Otros', amount: '4800', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: categoryRules('PAPELERIA', 'JUGUETERIA', 'DOCTOR', 'HOSPITAL', 'FARMACIA', 'ZARA', 'LIVERPOOL') },
  { name: 'Clases', amount: '8000', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: keywordRules('MISS', 'MAESTRO', 'MAESTRA', 'CLASE', 'CLASES') },
  { name: 'Mounjaro', amount: '6500', period: BudgetPeriod.MONTHLY, nature: BudgetNature.EXPENSE, rules: keywordRules('MOUNJARO') },
  { name: 'DISNEY', amount: '130000', period: BudgetPeriod.ANNUAL, nature: BudgetNature.EXPENSE, rules: aliasRules('DISNEY') },
  { name: 'Cumple Esli', amount: '60000', period: BudgetPeriod.ANNUAL, nature: BudgetNature.EXPENSE, rules: aliasRules('CUMPLE ESLI', 'CUMPLEAÑOS ESLI') },
  { name: 'Cumple LUCA', amount: '15000', period: BudgetPeriod.ANNUAL, nature: BudgetNature.EXPENSE, rules: aliasRules('CUMPLE LUCA', 'CUMPLEAÑOS LUCA') },
  { name: 'Cumple LUCRECIA', amount: '15000', period: BudgetPeriod.ANNUAL, nature: BudgetNature.EXPENSE, rules: aliasRules('CUMPLE LUCRECIA', 'CUMPLEAÑOS LUCRECIA') },
  { name: 'Regalos NAVIDAD', amount: '60000', period: BudgetPeriod.ANNUAL, nature: BudgetNature.EXPENSE, rules: aliasRules('NAVIDAD', 'REGALOS NAVIDAD') },
  { name: 'Vacaciones', amount: '340000', period: BudgetPeriod.ANNUAL, nature: BudgetNature.EXPENSE, rules: aliasRules('VACACIONES', 'VIAJE DE VACACIONES') },
  { name: 'Cumpleaños escuela', amount: '12000', period: BudgetPeriod.ANNUAL, nature: BudgetNature.EXPENSE, rules: aliasRules('CUMPLE ESCUELA', 'CUMPLEAÑOS ESCUELA') },
];

function normalizeRuleValue(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function rulePriority(type: BudgetRuleType, budgetName: string): number {
  const base = {
    [BudgetRuleType.EXPLICIT_ALIAS]: 500,
    [BudgetRuleType.KEYWORD]: 400,
    [BudgetRuleType.MERCHANT_NAME]: 300,
    [BudgetRuleType.EXPENSE_CATEGORY]: 200,
  }[type];
  return budgetName === 'Otros' ? 100 : base;
}

async function main(): Promise<void> {
  await prisma.user.upsert({
    where: { id: IDS.admin },
    update: {},
    create: {
      id: IDS.admin,
      email: 'admin@cfoia.local',
      name: 'Administración CFO IA',
      platformRole: PlatformRole.PLATFORM_ADMIN,
    },
  });
  await prisma.user.upsert({
    where: { id: IDS.owner },
    update: {},
    create: { id: IDS.owner, email: 'owner@example.com', name: 'Cliente de Prueba' },
  });
  await prisma.account.upsert({
    where: { id: IDS.account },
    update: {},
    create: { id: IDS.account, name: 'Empresa Demo, S.A. de C.V.' },
  });
  await prisma.accountMember.upsert({
    where: { accountId_userId: { accountId: IDS.account, userId: IDS.owner } },
    update: {},
    create: {
      id: IDS.membership,
      accountId: IDS.account,
      userId: IDS.owner,
      role: AccountRole.ACCOUNT_OWNER,
    },
  });
  await prisma.workspace.upsert({
    where: { id: IDS.workspace },
    update: { timezone: 'America/Mexico_City' },
    create: {
      id: IDS.workspace,
      accountId: IDS.account,
      name: 'Operación principal',
      baseCurrency: 'MXN',
      timezone: 'America/Mexico_City',
    },
  });
  await prisma.paymentInstrument.upsert({
    where: { id: IDS.amexAeromexico },
    update: {
      name: 'AMEX Aerom\u00e9xico Platinum',
      aliases: ['amex', 'american express', 'amex platinum', 'aeromexico platinum'],
      active: true,
    },
    create: {
      id: IDS.amexAeromexico,
      workspaceId: IDS.workspace,
      type: 'CREDIT_CARD',
      name: 'AMEX Aerom\u00e9xico Platinum',
      holderName: 'Esli',
      aliases: ['amex', 'american express', 'amex platinum', 'aeromexico platinum'],
    },
  });
  await prisma.paymentInstrument.upsert({
    where: { id: IDS.bbvaInfinite },
    update: {
      name: 'BBVA Visa Infinite',
      aliases: ['bbva', 'visa bbva', 'visa infinite', 'infinita'],
      active: true,
    },
    create: {
      id: IDS.bbvaInfinite,
      workspaceId: IDS.workspace,
      type: 'CREDIT_CARD',
      name: 'BBVA Visa Infinite',
      bank: 'BBVA',
      holderName: 'Jovanny',
      aliases: ['bbva', 'visa bbva', 'visa infinite', 'infinita'],
    },
  });
  await prisma.subscription.upsert({
    where: { id: IDS.subscription },
    update: {},
    create: {
      id: IDS.subscription,
      accountId: IDS.account,
      status: SubscriptionStatus.ACTIVE,
      currency: 'MXN',
    },
  });
  await prisma.taxProfileRequest.upsert({
    where: { id: IDS.request },
    update: {},
    create: {
      id: IDS.request,
      accountId: IDS.account,
      requestedById: IDS.owner,
      rfc: 'XAXX010101000',
      legalName: 'Empresa Demo, S.A. de C.V.',
    },
  });

  await prisma.merchantInvoiceProfile.upsert({
    where: { merchantKey: 'COSTCO' },
    update: { displayName: 'Costco', active: true },
    create: {
      id: IDS.costcoInvoiceProfile,
      merchantKey: 'COSTCO',
      displayName: 'Costco',
      active: true,
      configuration: {},
    },
  });
  await prisma.merchantInvoiceProfile.upsert({
    where: { merchantKey: 'CHEDRAUI' },
    update: { displayName: 'Chedraui', active: true },
    create: {
      id: IDS.chedrauiInvoiceProfile,
      merchantKey: 'CHEDRAUI',
      displayName: 'Chedraui',
      active: true,
      configuration: {},
    },
  });

  await prisma.budget.updateMany({
    where: { workspaceId: IDS.workspace, name: 'Miss Adri' },
    data: { name: 'Clases' },
  });

  for (const definition of BUDGETS) {
    const startDate = definition.period === BudgetPeriod.ANNUAL
      ? new Date('2026-01-01T00:00:00.000Z')
      : new Date('2026-08-01T00:00:00.000Z');
    const budget = await prisma.budget.upsert({
      where: { workspaceId_name: { workspaceId: IDS.workspace, name: definition.name } },
      update: {
        amount: definition.amount,
        currency: 'MXN',
        period: definition.period,
        nature: definition.nature,
        startDate,
        endDate: null,
        active: true,
      },
      create: {
        workspaceId: IDS.workspace,
        name: definition.name,
        amount: definition.amount,
        currency: 'MXN',
        period: definition.period,
        nature: definition.nature,
        startDate,
      },
    });

    for (const rule of definition.rules) {
      const normalizedValue = normalizeRuleValue(rule.value);
      await prisma.budgetMatchingRule.upsert({
        where: {
          budgetId_ruleType_normalizedValue: {
            budgetId: budget.id,
            ruleType: rule.type,
            normalizedValue,
          },
        },
        update: {
          value: rule.value,
          priority: rulePriority(rule.type, definition.name),
          active: true,
        },
        create: {
          budgetId: budget.id,
          ruleType: rule.type,
          value: rule.value,
          normalizedValue,
          priority: rulePriority(rule.type, definition.name),
        },
      });
    }
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
