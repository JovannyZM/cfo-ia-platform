import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  EXPENSE_EVIDENCE_INTERPRETED,
  EXPENSE_REGISTERED,
  type DomainEvent,
  type EventBus,
} from '@cfo-ia/domain';
import { Test } from '@nestjs/testing';
import { AccountRole, PlatformRole, PrismaClient, TaxProfileRequestStatus } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { EXPENSE_EVIDENCE_INTERPRETER } from '../../src/evidence/expense-evidence-interpreter';
import { FakeExpenseEvidenceInterpreter } from '../../src/evidence/fake-expense-evidence-interpreter';
import { EVENT_BUS } from '../../src/workers/workers.module';
import { BudgetClassifierService } from '../../src/budgets/budget-classifier.service';

const SEEDED = {
  adminId: '00000000-0000-4000-8000-000000000001',
  ownerId: '00000000-0000-4000-8000-000000000002',
  accountId: '00000000-0000-4000-8000-000000000003',
  requestId: '00000000-0000-4000-8000-000000000006',
  workspaceId: '00000000-0000-4000-8000-000000000007',
};

const RFC = {
  success: 'AAA010101AAA',
  rollback: 'BBB010101BBB',
  duplicate: 'CCC010101CCC',
  concurrent: 'DDD010101DDD',
  shared: 'EEE010101EEE',
};

const prisma = new PrismaClient();
const fakeInterpreter = new FakeExpenseEvidenceInterpreter();
let app: INestApplication;
let httpServer: App;
let databaseReady = false;

function requireDedicatedIntegrationDatabase(): string {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for integration tests.');
  }
  if (process.env.DATABASE_URL !== testDatabaseUrl) {
    throw new Error('Prisma is not configured with TEST_DATABASE_URL.');
  }
  return testDatabaseUrl;
}

function runDatabaseCommand(args: string[]): void {
  const cli = resolve(process.cwd(), 'node_modules/prisma/build/index.js');
  execFileSync(process.execPath, [cli, ...args], {
    cwd: resolve(process.cwd(), '../../packages/database'),
    // The dedicated Neon test URL is pooled. Integration setup is single-process,
    // so disabling Prisma's session-level advisory lock avoids a stale pooled lock.
    env: { ...process.env, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1' },
    stdio: 'inherit',
  });
}

function runSeed(): void {
  const tsxCli = resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
  const seed = resolve(process.cwd(), '../../packages/database/prisma/seed.ts');
  execFileSync(process.execPath, [tsxCli, seed], {
    cwd: resolve(process.cwd(), '../..'),
    env: process.env,
    stdio: 'inherit',
  });
}

async function createUser(email: string, platformRole?: PlatformRole) {
  return prisma.user.create({
    data: { email, name: email, ...(platformRole ? { platformRole } : {}) },
  });
}

async function createAccount(name: string) {
  return prisma.account.create({
    data: {
      name,
      subscriptions: { create: { status: 'ACTIVE', currency: 'MXN' } },
    },
    include: { subscriptions: true },
  });
}

async function createRequest(
  accountId: string,
  requestedById: string,
  rfc: string,
  status: TaxProfileRequestStatus = TaxProfileRequestStatus.UNDER_REVIEW,
) {
  return prisma.taxProfileRequest.create({
    data: { accountId, requestedById, rfc, legalName: `Persona ${rfc}`, status },
  });
}

function approve(requestId: string) {
  return request(httpServer)
    .post(`/admin/tax-profile-requests/${requestId}/approve`)
    .set('x-user-id', SEEDED.adminId);
}

beforeAll(async () => {
  requireDedicatedIntegrationDatabase();

  // migrate reset drops the public schema, proving the initial migration applies to an empty schema.
  runDatabaseCommand([
    'migrate',
      'reset',
      '--force',
      '--skip-seed',
      '--skip-generate',
      '--schema',
    'prisma/schema.prisma',
  ]);
  runSeed();
  databaseReady = true;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EXPENSE_EVIDENCE_INTERPRETER)
    .useValue(fakeInterpreter)
    .compile();
  app = moduleRef.createNestApplication();
  await app.init();
  httpServer = app.getHttpServer() as App;
});

afterAll(async () => {
  if (app) await app.close();
  if (databaseReady) {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "AuditEvent", "Expense", "SubscriptionItem", "UserTaxProfileAccess", "TaxProfileRequest",
        "TaxProfile", "Subscription", "AccountMember", "User", "Account"
      RESTART IDENTITY CASCADE
    `);
  }
  await prisma.$disconnect();
});

describe('PostgreSQL migration and seed', () => {
  it('applies the initial migration from an empty database schema', async () => {
    const migrations = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date }>>`
      SELECT migration_name, finished_at
      FROM "_prisma_migrations"
      WHERE rolled_back_at IS NULL
    `;
    expect(migrations.map(({ migration_name }) => migration_name)).toEqual([
      '20260729000000_initial',
      '20260729210000_add_workspaces_and_expenses',
      '20260804040000_add_expense_spender_and_payment_instruments',
      '20260804120000_add_expense_cancellation',
      '20260804130000_add_expense_source_context',
      '20260804181914',
      '20260804185810',
      '20260804203000_add_expense_evidence_fingerprint',
      '20260805090000_add_budgets',
      '20260805110000_add_expense_budget_assignments',
    ]);
    expect(migrations.every(({ finished_at }) => Boolean(finished_at))).toBe(true);
  });

  it('runs the seed successfully', async () => {
    const [admin, owner, account, seededRequest, budgets, rules, annualDates, monthlyDates] = await Promise.all([
      prisma.user.findUnique({ where: { id: SEEDED.adminId } }),
      prisma.user.findUnique({ where: { id: SEEDED.ownerId } }),
      prisma.account.findUnique({ where: { id: SEEDED.accountId } }),
      prisma.taxProfileRequest.findUnique({ where: { id: SEEDED.requestId } }),
      prisma.budget.count({ where: { workspaceId: SEEDED.workspaceId } }),
      prisma.budgetMatchingRule.count({ where: { budget: { workspaceId: SEEDED.workspaceId } } }),
      prisma.budget.findMany({
        where: { workspaceId: SEEDED.workspaceId, period: 'ANNUAL' }, select: { startDate: true },
      }),
      prisma.budget.findMany({
        where: { workspaceId: SEEDED.workspaceId, period: 'MONTHLY' }, select: { startDate: true },
      }),
    ]);
    expect(admin?.platformRole).toBe(PlatformRole.PLATFORM_ADMIN);
    expect(owner).not.toBeNull();
    expect(account).not.toBeNull();
    expect(seededRequest?.status).toBe(TaxProfileRequestStatus.SUBMITTED);
    expect(budgets).toBe(27);
    expect(rules).toBe(58);
    expect(annualDates.every(({ startDate }) => startDate.toISOString().startsWith('2026-01-01'))).toBe(true);
    expect(monthlyDates.every(({ startDate }) => startDate.toISOString().startsWith('2026-08-01'))).toBe(true);
  });
});

describe('Budget infrastructure', () => {
  it('reads the complete seed through the API and isolates access by Workspace', async () => {
    const response = await request(httpServer)
      .get(`/workspaces/${SEEDED.workspaceId}/budgets`)
      .set('x-user-id', SEEDED.ownerId)
      .expect(200);
    expect(response.body).toHaveLength(27);

    const netflix = (response.body as Array<{ id: string; name: string }>).find(({ name }) => name === 'Netflix');
    expect(netflix).toBeDefined();
    await request(httpServer)
      .get(`/workspaces/${SEEDED.workspaceId}/budgets/${netflix!.id}`)
      .set('x-user-id', SEEDED.ownerId)
      .expect(200);

    await request(httpServer)
      .get('/workspaces/20000000-0000-4000-8000-000000000001/budgets')
      .set('x-user-id', SEEDED.ownerId)
      .expect(403);
  });

  it('classifies with persisted rules and never modifies Expense', async () => {
    const classifier = app.get(BudgetClassifierService);
    const expensesBefore = await prisma.expense.count({ where: { workspaceId: SEEDED.workspaceId } });

    const netflix = await classifier.classify(SEEDED.workspaceId, { merchantName: 'netflix' });
    const telcel = await classifier.classify(SEEDED.workspaceId, { merchantName: 'TELCEL' });
    const travel = await classifier.classify(SEEDED.workspaceId, {
      merchantName: 'Gasolinera Pemex', category: 'Gasolinerias',
    });

    expect((await prisma.budget.findUniqueOrThrow({ where: { id: netflix.budgetId! } })).name).toBe('Netflix');
    expect(telcel).toMatchObject({ budgetId: null, ambiguous: true });
    expect((await prisma.budget.findUniqueOrThrow({ where: { id: travel.budgetId! } })).name).toBe('Gasolina');
    expect(await prisma.expense.count({ where: { workspaceId: SEEDED.workspaceId } })).toBe(expensesBefore);
  });
});

describe('Expense analysis API', () => {
  it('returns the structured daily close and enforces Workspace authorization', async () => {
    const response = await request(httpServer)
      .get(`/workspaces/${SEEDED.workspaceId}/expense-analysis/daily-close?date=2026-08-05`)
      .set('x-user-id', SEEDED.ownerId)
      .expect(200);
    expect(response.body).toMatchObject({
      analysis: { date: '2026-08-05', timeZone: 'America/Mexico_City' },
    });
    expect(typeof (response.body as { message: unknown }).message).toBe('string');

    await request(httpServer)
      .get('/workspaces/20000000-0000-4000-8000-000000000001/expense-analysis/daily-close?date=2026-08-05')
      .set('x-user-id', SEEDED.ownerId)
      .expect(403);
  });
});

describe('public and account API authorization', () => {
  it('GET /health responds successfully', async () => {
    await request(httpServer).get('/health').expect(200).expect({ status: 'ok' });
  });

  it('allows an ACCOUNT_OWNER to create a TaxProfileRequest', async () => {
    const response = await request(httpServer)
      .post(`/accounts/${SEEDED.accountId}/tax-profile-requests`)
      .set('x-user-id', SEEDED.ownerId)
      .send({ rfc: RFC.success, legalName: 'Solicitud del propietario' })
      .expect(201);

    expect(response.body).toMatchObject({
      accountId: SEEDED.accountId,
      requestedById: SEEDED.ownerId,
      status: TaxProfileRequestStatus.SUBMITTED,
    });
  });

  it('denies a MEMBER requesting for an account it does not belong to', async () => {
    const member = await createUser('member.integration@cfoia.local');
    const memberAccount = await createAccount('Cuenta del miembro');
    await prisma.accountMember.create({
      data: { userId: member.id, accountId: memberAccount.id, role: AccountRole.MEMBER },
    });

    await request(httpServer)
      .post(`/accounts/${SEEDED.accountId}/tax-profile-requests`)
      .set('x-user-id', member.id)
      .send({ rfc: 'FFF010101FFF', legalName: 'No autorizado' })
      .expect(403);
  });

  it('denies normal users access to /admin', async () => {
    await request(httpServer)
      .get('/admin/tax-profile-requests')
      .set('x-user-id', SEEDED.ownerId)
      .expect(403);
  });

  it('does not expose POST /tax-profiles', async () => {
    await request(httpServer)
      .post('/tax-profiles')
      .set('x-user-id', SEEDED.ownerId)
      .send({ rfc: 'GGG010101GGG', legalName: 'No existe' })
      .expect(404);
  });

  it('only returns TaxProfiles for accounts the user belongs to', async () => {
    const foreignAccount = await createAccount('Cuenta ajena');
    const foreignWorkspace = await prisma.workspace.create({
      data: { accountId: foreignAccount.id, name: 'Workspace ajeno' },
    });
    await prisma.taxProfile.create({
      data: { accountId: foreignAccount.id, workspaceId: foreignWorkspace.id, rfc: 'HHH010101HHH', legalName: 'Perfil ajeno' },
    });

    await request(httpServer)
      .get(`/accounts/${foreignAccount.id}/tax-profiles`)
      .set('x-user-id', SEEDED.ownerId)
      .expect(403);

    const ownResponse = await request(httpServer)
      .get(`/accounts/${SEEDED.accountId}/tax-profiles`)
      .set('x-user-id', SEEDED.ownerId)
      .expect(200);
    expect(Array.isArray(ownResponse.body)).toBe(true);
  });
});

describe('Expense Assistant flow', () => {
  const validExpense = {
    merchantName: 'Costco',
    description: 'Compra de insumos',
    occurredAt: '2026-07-29T18:00:00.000Z',
    originalAmount: '1250.50',
    originalCurrency: 'MXN',
    category: 'INSUMOS',
    paymentMethod: 'CARD',
  };

  it('runs endpoint -> event -> Brain -> Worker -> PostgreSQL and reads the Expense', async () => {
    const created = await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/interpreted-evidence`)
      .set('x-user-id', SEEDED.ownerId)
      .send(validExpense)
      .expect(201);

    expect(created.body).toMatchObject({
      workspaceId: SEEDED.workspaceId,
      merchantName: 'Costco',
      originalCurrency: 'MXN',
      exchangeRate: '1',
      baseAmount: '1250.5',
      status: 'REGISTERED',
    });
    const expenseId = (created.body as { id: string }).id;
    await request(httpServer)
      .get(`/workspaces/${SEEDED.workspaceId}/expenses/${expenseId}`)
      .set('x-user-id', SEEDED.ownerId)
      .expect(200);
    expect(await prisma.expenseBudgetAssignment.count({ where: { expenseId } })).toBe(1);
  });

  it('assigns an explicitly selected budget without modifying Expense amounts', async () => {
    const created = await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/interpreted-evidence`)
      .set('x-user-id', SEEDED.ownerId)
      .send({ ...validExpense, originalAmount: '777', explicitBudgetName: 'DISNEY' })
      .expect(201);
    const expenseId = (created.body as { id: string }).id;
    const [expense, assignment] = await Promise.all([
      prisma.expense.findUniqueOrThrow({ where: { id: expenseId } }),
      prisma.expenseBudgetAssignment.findUniqueOrThrow({
        where: { expenseId }, include: { budget: true },
      }),
    ]);
    expect(assignment).toMatchObject({ status: 'ASSIGNED', assignedBy: 'EXPLICIT_USER' });
    expect(assignment.budget?.name).toBe('DISNEY');
    expect(expense.originalAmount.toString()).toBe('777');
    expect(expense.baseAmount.toString()).toBe('777');
  });

  it('requires exchangeRate for foreign currency and validates amount and currency', async () => {
    await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/interpreted-evidence`)
      .set('x-user-id', SEEDED.ownerId)
      .send({ ...validExpense, originalCurrency: 'USD' })
      .expect(400);
    await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/interpreted-evidence`)
      .set('x-user-id', SEEDED.ownerId)
      .send({ ...validExpense, originalAmount: '0' })
      .expect(400);
    await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/interpreted-evidence`)
      .set('x-user-id', SEEDED.ownerId)
      .send({ ...validExpense, originalCurrency: 'mxn' })
      .expect(400);
  });

  it('calculates foreign-currency baseAmount', async () => {
    const response = await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/interpreted-evidence`)
      .set('x-user-id', SEEDED.ownerId)
      .send({
        ...validExpense,
        originalAmount: '10.25',
        originalCurrency: 'USD',
        exchangeRate: '18.5',
      })
      .expect(201);
    expect(response.body).toMatchObject({ baseAmount: '189.625', exchangeRate: '18.5' });
  });

  it('is idempotent for Expense and AuditEvent and preserves Brain trace fields', async () => {
    const eventBus = app.get<EventBus>(EVENT_BUS);
    const eventId = '10000000-0000-4000-8000-000000000001';
    const published: DomainEvent[] = [];
    const unsubscribe = eventBus.subscribe(EXPENSE_REGISTERED, (event) => {
      published.push(event);
    });
    const event: DomainEvent = {
      eventId,
      type: EXPENSE_EVIDENCE_INTERPRETED,
      workspaceId: SEEDED.workspaceId,
      correlationId: 'expense-flow-correlation',
      createdAt: new Date(),
      payload: validExpense,
    };

    await eventBus.publish(event);
    await eventBus.publish(event);
    unsubscribe();

    const expense = await prisma.expense.findUniqueOrThrow({ where: { sourceEventId: eventId } });
    expect(await prisma.expense.count({ where: { sourceEventId: eventId } })).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: { entityType: 'Expense', entityId: expense.id, action: 'EXPENSE_REGISTERED' },
      }),
    ).toBe(1);
    expect(published).toHaveLength(2);
    expect(published[0]).toMatchObject({
      workspaceId: SEEDED.workspaceId,
      correlationId: 'expense-flow-correlation',
      causationId: eventId,
    });
  });

  it('rejects a missing Workspace and prevents cross-Workspace reads', async () => {
    await request(httpServer)
      .post('/workspaces/20000000-0000-4000-8000-000000000001/expenses/interpreted-evidence')
      .set('x-user-id', SEEDED.ownerId)
      .send(validExpense)
      .expect(403);

    const expense = await prisma.expense.findFirstOrThrow({
      where: { workspaceId: SEEDED.workspaceId },
    });
    const otherWorkspace = await prisma.workspace.create({
      data: { accountId: SEEDED.accountId, name: 'Otro Workspace' },
    });
    await request(httpServer)
      .get(`/workspaces/${otherWorkspace.id}/expenses/${expense.id}`)
      .set('x-user-id', SEEDED.ownerId)
      .expect(404);
  });

  it('rejects correction of a published expense without changing or duplicating it', async () => {
    const expense = await prisma.expense.create({
      data: {
        workspaceId: SEEDED.workspaceId,
        sourceEventId: '30000000-0000-4000-8000-000000000001',
        sourceChannel: 'TELEGRAM', sourceConversationId: 'correction-chat',
        merchantName: 'gasolina',
        description: 'gasolina',
        occurredAt: new Date('2026-08-04T12:00:00.000Z'),
        originalAmount: '850', originalCurrency: 'MXN', exchangeRate: '1', baseAmount: '850',
        spenderName: 'Jovanny', paymentMethod: 'CASH',
      },
    });
    const countBefore = await prisma.expense.count();

    const response = await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/text`)
      .set('x-user-id', SEEDED.ownerId)
      .send({ text: 'No fueron 850, fueron 820', conversationId: 'correction-chat' })
      .expect(409);

    expect(response.body).toEqual({
      status: 'CORRECTION_NOT_ALLOWED',
      message: 'No puedo modificar un gasto ya registrado. Debes cancelarlo y registrar uno nuevo.',
    });
    expect(await prisma.expense.count()).toBe(countBefore);
    const persisted = await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } });
    expect(persisted.originalAmount.toString()).toBe('850');
    expect(persisted.baseAmount.toString()).toBe('850');
    expect(await prisma.auditEvent.count({ where: { entityId: expense.id, action: 'EXPENSE_UPDATED' } })).toBe(0);
  });

  it('does not open a correction session when several expenses share the chat', async () => {
    const expenses = await Promise.all([1, 2].map((sequence) => prisma.expense.create({
      data: {
        workspaceId: SEEDED.workspaceId,
        sourceEventId: `30000000-0000-4000-8000-00000000000${sequence + 1}`,
        sourceChannel: 'TELEGRAM', sourceConversationId: 'ambiguous-chat',
        merchantName: `Gasto ${sequence}`, occurredAt: new Date(), originalAmount: '100',
        originalCurrency: 'MXN', exchangeRate: '1', baseAmount: '100', spenderName: 'Jovanny',
        paymentMethod: 'CASH',
      },
    })));

    const response = await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/text`)
      .set('x-user-id', SEEDED.ownerId)
      .send({ text: 'Corrige a 820', conversationId: 'ambiguous-chat' })
      .expect(409);
    expect(response.body).toEqual({
      status: 'CORRECTION_NOT_ALLOWED',
      message: 'No puedo modificar un gasto ya registrado. Debes cancelarlo y registrar uno nuevo.',
    });
    expect(await prisma.expense.count({ where: { id: { in: expenses.map(({ id }) => id) }, originalAmount: '100' } })).toBe(2);
  });
});

describe('Expense evidence flow', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

  beforeEach(() => {
    fakeInterpreter.error = undefined;
    fakeInterpreter.onInterpret = undefined;
    fakeInterpreter.result = {
      merchantName: 'Costco',
      merchantRfc: null,
      description: 'Compra de insumos',
      occurredAt: '2026-07-29T18:00:00.000Z',
      originalAmount: '1250.50',
      originalCurrency: 'MXN',
      category: 'INSUMOS',
      paymentMethod: 'DEBIT_CARD',
      paymentInstrumentType: 'CARD',
      paymentLast4: '1234',
      spenderName: 'Integration User',
      documentNumber: null,
      confidence: 0.95,
      warnings: [],
    };
  });

  it('keeps the JPEG in memory through Brain and registers the Expense', async () => {
    await prisma.paymentInstrument.create({
      data: {
        workspaceId: SEEDED.workspaceId,
        type: 'CARD',
        name: 'Integration card',
        last4: '1234',
        holderName: 'Integration User',
      },
    });
    let receivedImage: Uint8Array | undefined;
    let interpretationCalls = 0;
    fakeInterpreter.onInterpret = (input) => {
      receivedImage = input.image;
      interpretationCalls += 1;
    };

    const response = await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/evidence`)
      .set('x-user-id', SEEDED.ownerId)
      .attach('file', jpeg, { filename: 'ticket.jpg', contentType: 'image/jpeg' })
      .expect(201);

    const expenseId = (response.body as { expense: { expenseId: string } }).expense
      .expenseId;
    expect(receivedImage).toEqual(jpeg);
    expect(response.body).toMatchObject({
      expense: {
        expenseId,
        merchantName: 'Costco',
        originalAmount: '1250.5',
        status: 'REGISTERED',
      },
    });
    expect(await prisma.expense.count({ where: { id: expenseId } })).toBe(1);
    const stored = await prisma.expense.findUniqueOrThrow({ where: { id: expenseId } });
    expect(stored).toMatchObject({
      spenderName: 'Integration User', paymentMethod: 'CARD', paymentLast4: '1234',
    });
    expect(stored.paymentInstrumentId).not.toBeNull();
    expect(await prisma.paymentInstrument.count({ where: {
      workspaceId: SEEDED.workspaceId, type: 'CARD', last4: '1234', holderName: 'Integration User',
    } })).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: { entityType: 'Expense', entityId: expenseId, action: 'EXPENSE_REGISTERED' },
      }),
    ).toBe(1);
    const duplicate = await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/evidence`)
      .set('x-user-id', SEEDED.ownerId)
      .attach('file', jpeg, { filename: 'ticket.jpg', contentType: 'image/jpeg' })
      .expect(200);
    expect(duplicate.body).toMatchObject({
      status: 'DUPLICATE_EVIDENCE',
      message: 'Este ticket ya fue registrado.',
      expenseId,
    });
    expect(interpretationCalls).toBe(1);
    expect(await prisma.expense.count({ where: { evidenceSha256: stored.evidenceSha256 } })).toBe(1);
    expect(await prisma.auditEvent.count({
      where: { entityType: 'Expense', entityId: expenseId, action: 'EXPENSE_REGISTERED' },
    })).toBe(1);
  });

  it('accepts a PDF through the same evidence flow', async () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
    let receivedMimeType: string | undefined;
    fakeInterpreter.onInterpret = (input) => { receivedMimeType = input.mimeType; };
    await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/evidence`)
      .set('x-user-id', SEEDED.ownerId)
      .attach('file', pdf, { filename: 'ticket.pdf', contentType: 'application/pdf' })
      .expect(201);
    expect(receivedMimeType).toBe('application/pdf');
  });

  it('asks for an unknown card holder and reuses the learned holder later', async () => {
    fakeInterpreter.result = { ...fakeInterpreter.result, paymentLast4: '9876', spenderName: null };
    let interpretationCalls = 0;
    fakeInterpreter.onInterpret = () => { interpretationCalls += 1; };
    const conversationId = `photo-session-${randomUUID()}`;
    const expenseCountBefore = await prisma.expense.count();
    const first = await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/evidence`)
      .set('x-user-id', SEEDED.ownerId)
      .field('sourceChannel', 'TELEGRAM')
      .field('sourceConversationId', conversationId)
      .attach('file', jpeg, { filename: 'ticket.jpg', contentType: 'image/jpeg' })
      .expect(202);
    const firstBody = first.body as { draft: Record<string, unknown>; status: string; missingFields: string[] };
    expect(firstBody).toMatchObject({
      status: 'NEEDS_INFORMATION',
      missingFields: ['paymentInstrumentDetails'],
    });

    await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/text`)
      .set('x-user-id', SEEDED.ownerId)
      .send({
        text: 'BBVA Débito de Jovanny',
        sourceChannel: 'TELEGRAM',
        conversationId,
      })
      .expect(201);
    expect(interpretationCalls).toBe(1);
    expect(await prisma.expense.count()).toBe(expenseCountBefore + 1);
    expect(await prisma.expense.count({ where: {
      workspaceId: SEEDED.workspaceId,
      sourceChannel: 'TELEGRAM',
      sourceConversationId: conversationId,
    } })).toBe(1);
    expect(await prisma.conversationSession.count({ where: {
      workspaceId: SEEDED.workspaceId,
      sourceChannel: 'TELEGRAM',
      sourceConversationId: conversationId,
      status: { in: ['ACTIVE', 'WAITING_INPUT'] },
    } })).toBe(0);
    expect(await prisma.paymentInstrument.count({ where: {
      workspaceId: SEEDED.workspaceId, type: 'CARD', last4: '9876', holderName: 'Jovanny',
    } })).toBe(1);

    await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/evidence`)
      .set('x-user-id', SEEDED.ownerId)
      .field('sourceChannel', 'TELEGRAM')
      .field('sourceConversationId', `photo-repeat-${randomUUID()}`)
      .attach('file', Buffer.concat([jpeg, Buffer.from([1])]), {
        filename: 'ticket.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);
  });

  it('accepts PNG and rejects content whose bytes do not match its MIME', async () => {
    await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/evidence`)
      .set('x-user-id', SEEDED.ownerId)
      .attach('file', png, { filename: 'ticket.png', contentType: 'image/png' })
      .expect(201);
    await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/evidence`)
      .set('x-user-id', SEEDED.ownerId)
      .attach('file', Buffer.from('plain text'), {
        filename: 'fake.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);
  });

  it('rejects files larger than 10 MB without registering an Expense', async () => {
    const before = await prisma.expense.count();
    await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/evidence`)
      .set('x-user-id', SEEDED.ownerId)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1, 1), {
        filename: 'oversized.jpg',
        contentType: 'image/jpeg',
      })
      .expect(413);
    expect(await prisma.expense.count()).toBe(before);
  });

  it('returns NEEDS_REVIEW without creating Expense for low confidence', async () => {
    const expenseCountBefore = await prisma.expense.count();
    fakeInterpreter.result = {
      ...fakeInterpreter.result,
      occurredAt: null,
      confidence: 0.67,
      warnings: ['La fecha no es legible'],
    };
    const response = await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/evidence`)
      .set('x-user-id', SEEDED.ownerId)
      .attach('file', Buffer.concat([jpeg, Buffer.from('low-confidence')]), {
        filename: 'unclear.jpg',
        contentType: 'image/jpeg',
      })
      .expect(202);
    expect(response.body).toMatchObject({
      status: 'NEEDS_REVIEW',
      errorCode: 'NEEDS_REVIEW',
      confidence: 0.67,
      missingFields: ['occurredAt'],
    });
    expect(await prisma.expense.count()).toBe(expenseCountBefore);
  });

  it('marks technical interpreter timeout as FAILED and creates no Expense', async () => {
    const expenseCountBefore = await prisma.expense.count();
    fakeInterpreter.error = new Error('interpreter timeout');
    const response = await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/evidence`)
      .set('x-user-id', SEEDED.ownerId)
      .attach('file', Buffer.concat([jpeg, Buffer.from('timeout-case')]), {
        filename: 'timeout.jpg',
        contentType: 'image/jpeg',
      })
      .expect(422);
    expect(response.body).toMatchObject({
      status: 'FAILED',
      errorCode: 'INTERPRETER_TIMEOUT',
    });
    expect(await prisma.expense.count()).toBe(expenseCountBefore);
  });

  it('rejects interpreter output that violates the structured schema', async () => {
    fakeInterpreter.result = {
      ...fakeInterpreter.result,
      confidence: 2,
    };
    const response = await request(httpServer)
      .post(`/workspaces/${SEEDED.workspaceId}/expenses/evidence`)
      .set('x-user-id', SEEDED.ownerId)
      .attach('file', Buffer.concat([jpeg, Buffer.from('invalid-output')]), {
        filename: 'invalid.jpg',
        contentType: 'image/jpeg',
      })
      .expect(422);
    expect(response.body).toMatchObject({
      status: 'FAILED',
      errorCode: 'INVALID_INTERPRETER_RESPONSE',
    });
  });

  it('does not expose a persisted Evidence status endpoint', async () => {
    await request(httpServer)
      .get(
        `/workspaces/${SEEDED.workspaceId}/expenses/evidence/00000000-0000-4000-8000-000000000099`,
      )
      .set('x-user-id', SEEDED.ownerId)
      .expect(404);
  });
});

describe('PLATFORM_ADMIN approval workflow', () => {
  it('starts review and approves with exactly one profile, item and audit event', async () => {
    const created = await request(httpServer)
      .post(`/accounts/${SEEDED.accountId}/tax-profile-requests`)
      .set('x-user-id', SEEDED.ownerId)
      .send({ rfc: 'III010101III', legalName: 'Flujo administrativo' })
      .expect(201);
    const createdBody = created.body as unknown as {
      id: string;
      status: TaxProfileRequestStatus;
    };

    const review = await request(httpServer)
      .post(`/admin/tax-profile-requests/${createdBody.id}/start-review`)
      .set('x-user-id', SEEDED.adminId)
      .expect(201);
    const reviewBody = review.body as unknown as { status: TaxProfileRequestStatus };
    expect(reviewBody.status).toBe(TaxProfileRequestStatus.UNDER_REVIEW);

    await approve(createdBody.id).expect(201);

    const persisted = await prisma.taxProfileRequest.findUniqueOrThrow({
      where: { id: createdBody.id },
    });
    const [profiles, items, events] = await Promise.all([
      prisma.taxProfile.count({ where: { accountId: SEEDED.accountId, rfc: 'III010101III' } }),
      prisma.subscriptionItem.count({ where: { taxProfileId: persisted.taxProfileId! } }),
      prisma.auditEvent.count({
        where: {
          entityId: createdBody.id,
          action: 'TAX_PROFILE_REQUEST_APPROVED',
        },
      }),
    ]);

    expect(persisted.status).toBe(TaxProfileRequestStatus.APPROVED);
    expect([profiles, items, events]).toEqual([1, 1, 1]);
  });

  it('rolls back the entire transaction when SubscriptionItem creation fails', async () => {
    const pending = await createRequest(SEEDED.accountId, SEEDED.ownerId, RFC.rollback);
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_subscription_item_for_integration()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced SubscriptionItem failure';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER force_subscription_item_failure
      BEFORE INSERT ON "SubscriptionItem"
      FOR EACH ROW EXECUTE FUNCTION fail_subscription_item_for_integration();
    `);

    try {
      await approve(pending.id).expect(500);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS force_subscription_item_failure ON "SubscriptionItem"',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS fail_subscription_item_for_integration()',
      );
    }

    const [persistedRequest, profiles, items, events] = await Promise.all([
      prisma.taxProfileRequest.findUniqueOrThrow({ where: { id: pending.id } }),
      prisma.taxProfile.count({ where: { accountId: SEEDED.accountId, rfc: RFC.rollback } }),
      prisma.subscriptionItem.count({
        where: { taxProfile: { accountId: SEEDED.accountId, rfc: RFC.rollback } },
      }),
      prisma.auditEvent.count({ where: { entityId: pending.id } }),
    ]);
    expect(persistedRequest.status).toBe(TaxProfileRequestStatus.UNDER_REVIEW);
    expect(persistedRequest.taxProfileId).toBeNull();
    expect([profiles, items, events]).toEqual([0, 0, 0]);
  });

  it('rejects a second approval without creating duplicates', async () => {
    const pending = await createRequest(SEEDED.accountId, SEEDED.ownerId, RFC.duplicate);
    await approve(pending.id).expect(201);
    await approve(pending.id).expect(409);

    const persisted = await prisma.taxProfileRequest.findUniqueOrThrow({
      where: { id: pending.id },
    });
    const [profiles, items, events] = await Promise.all([
      prisma.taxProfile.count({ where: { accountId: SEEDED.accountId, rfc: RFC.duplicate } }),
      prisma.subscriptionItem.count({ where: { taxProfileId: persisted.taxProfileId! } }),
      prisma.auditEvent.count({ where: { entityId: pending.id } }),
    ]);
    expect([profiles, items, events]).toEqual([1, 1, 1]);
  });

  it('prevents concurrent approvals from creating two TaxProfiles', async () => {
    const pending = await createRequest(SEEDED.accountId, SEEDED.ownerId, RFC.concurrent);
    const responses = await Promise.all([approve(pending.id), approve(pending.id)]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);

    const persisted = await prisma.taxProfileRequest.findUniqueOrThrow({
      where: { id: pending.id },
    });
    const [profiles, items, events] = await Promise.all([
      prisma.taxProfile.count({ where: { accountId: SEEDED.accountId, rfc: RFC.concurrent } }),
      prisma.subscriptionItem.count({ where: { taxProfileId: persisted.taxProfileId! } }),
      prisma.auditEvent.count({ where: { entityId: pending.id } }),
    ]);
    expect([profiles, items, events]).toEqual([1, 1, 1]);
  });

  it('enforces RFC uniqueness within an Account', async () => {
    const first = await createRequest(SEEDED.accountId, SEEDED.ownerId, RFC.shared);
    await approve(first.id).expect(201);
    const duplicate = await createRequest(SEEDED.accountId, SEEDED.ownerId, RFC.shared);
    await approve(duplicate.id).expect(409);

    expect(
      await prisma.taxProfile.count({ where: { accountId: SEEDED.accountId, rfc: RFC.shared } }),
    ).toBe(1);
  });

  it('allows the same RFC in different Accounts', async () => {
    const secondAccount = await createAccount('Segunda cuenta para RFC compartido');
    const secondOwner = await createUser('second.owner.integration@cfoia.local');
    await prisma.accountMember.create({
      data: {
        accountId: secondAccount.id,
        userId: secondOwner.id,
        role: AccountRole.ACCOUNT_OWNER,
      },
    });
    const secondRequest = await createRequest(secondAccount.id, secondOwner.id, RFC.shared);
    await approve(secondRequest.id).expect(201);

    expect(await prisma.taxProfile.count({ where: { rfc: RFC.shared } })).toBe(2);
  });
});
