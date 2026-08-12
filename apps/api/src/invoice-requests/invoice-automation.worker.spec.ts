/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/unbound-method */
import { EXPENSE_REGISTERED, type DomainEvent } from '@cfo-ia/domain';
import { InvoiceRequestStatus, TaxProfileStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma.service';
import type { PortalAdapterRegistry } from '../portal-automation/portal-adapter.registry';
import type { PortalFlowService } from '../portal-automation/portal-flow.service';
import { WorkerRegistry } from '../workers/worker-registry';
import { InvoiceAutomationWorker } from './invoice-automation.worker';
import type { InvoiceRequestsService } from './invoice-requests.service';

const ids = {
  workspace: '00000000-0000-4000-8000-000000000001',
  expense: '00000000-0000-4000-8000-000000000002',
  user: '00000000-0000-4000-8000-000000000003',
  tax: '00000000-0000-4000-8000-000000000004',
  request: '00000000-0000-4000-8000-000000000005',
  attempt: '00000000-0000-4000-8000-000000000006',
};

function event(overrides: Record<string, unknown> = {}): DomainEvent {
  return {
    eventId: '00000000-0000-4000-8000-000000000007',
    type: EXPENSE_REGISTERED,
    workspaceId: ids.workspace,
    createdAt: new Date(),
    payload: {
      expenseId: ids.expense, merchantName: 'Costco de México', documentNumber: 'ticket-number',
      originalAmount: '6893.12', originalCurrency: 'MXN', exchangeRate: '1', baseAmount: '6893.12',
      baseCurrency: 'MXN', occurredAt: new Date().toISOString(), status: 'REGISTERED', spenderName: 'User',
      sourceChannel: 'TELEGRAM', requestedByUserId: ids.user, ...overrides,
    },
  };
}

function harness(options: { requestStatus?: InvoiceRequestStatus; supported?: boolean } = {}) {
  const taxProfile = {
    id: ids.tax, status: TaxProfileStatus.ACTIVE, approvedAt: new Date(), rfc: 'RFC', legalName: 'Legal',
    postalCode: '91045', taxRegime: '626', cfdiUse: 'G03', billingEmail: 'billing@example.com',
  };
  const prisma = {
    merchantInvoiceProfile: { findMany: vi.fn().mockResolvedValue(options.supported === false ? [] : [{ merchantKey: 'COSTCO', displayName: 'Costco' }]) },
    taxProfile: { findMany: vi.fn().mockResolvedValue([taxProfile]) },
    invoiceRequest: { findUnique: vi.fn().mockResolvedValue({
      id: ids.request, workspaceId: ids.workspace, merchantKey: 'COSTCO', status: InvoiceRequestStatus.FAILED,
      expense: { sourceEventId: 'source-event', sourceChannel: 'TELEGRAM', sourceConversationId: 'chat', originalAmount: { toString: () => '6893.12' } },
      taxProfile,
    }) },
    conversationSession: { findMany: vi.fn().mockResolvedValue([{ contextJson: {
      sourceEventId: 'source-event', draft: { documentNumber: 'ticket-number' },
    } }]) },
  } as unknown as PrismaService;
  const requests = {
    create: vi.fn().mockResolvedValue({ id: ids.request, status: options.requestStatus ?? InvoiceRequestStatus.READY }),
    tryStart: vi.fn().mockResolvedValue({ attempt: { id: ids.attempt } }),
    tryRetryStart: vi.fn().mockResolvedValue({ attempt: { id: ids.attempt } }),
    markAcceptedPending: vi.fn().mockResolvedValue(undefined),
    markNeedsDocumentData: vi.fn().mockResolvedValue(undefined),
    markAlreadyCompleted: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  } as unknown as InvoiceRequestsService;
  const adapter = {
    adapterKey: 'CONFIGURED_ADAPTER', merchantKeys: ['COSTCO'], portalUrl: 'https://portal.example',
    allowedDomains: ['portal.example'], getStages: vi.fn().mockReturnValue([]),
    getActionLocator: vi.fn(), resolveOutcome: vi.fn(),
    resolveDocumentNumber: vi.fn((context: { documentNumber: string; documentIdentifiers?: { type: string; value: string }[] }) =>
      context.documentIdentifiers?.find((entry) => entry.type === 'BARCODE')?.value ?? context.documentNumber),
    validatePreflight: vi.fn(),
    buildInvoiceFlowInput: vi.fn().mockReturnValue({ portal: 'input' }),
  };
  const adapters = { findByMerchantKey: vi.fn().mockReturnValue(adapter) } as unknown as PortalAdapterRegistry;
  const portalFlows = {
    execute: vi.fn().mockResolvedValue({ outcome: 'ACCEPTED_PENDING' }),
  } as unknown as PortalFlowService;
  const registry = new WorkerRegistry();
  const worker = new InvoiceAutomationWorker(prisma, requests, adapters, portalFlows, registry);
  return { worker, prisma: prisma as any, requests, adapter, adapters, portalFlows, registry };
}

describe('InvoiceAutomationWorker', () => {
  it('creates InvoiceRequest at ExpenseRegistered and starts the configured PAE adapter', async () => {
    const h = harness();
    await h.worker.execute(event());
    expect(h.requests.create).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: ids.workspace, expenseId: ids.expense, merchantKey: 'COSTCO', taxProfileId: ids.tax,
    }));
    expect(h.requests.tryStart).toHaveBeenCalledWith(ids.workspace, ids.request, 'CONFIGURED_ADAPTER');
    expect(h.portalFlows.execute).toHaveBeenCalledOnce();
    expect(h.requests.markAcceptedPending).toHaveBeenCalledWith(ids.workspace, ids.request, ids.attempt);
  });

  it('does not start PAE again when the idempotent request already progressed', async () => {
    const h = harness({ requestStatus: InvoiceRequestStatus.PROCESSING });
    await h.worker.execute(event());
    expect(h.requests.create).toHaveBeenCalledOnce();
    expect(h.requests.tryStart).not.toHaveBeenCalled();
    expect(h.portalFlows.execute).not.toHaveBeenCalled();
  });

  it('does nothing when the merchant has no active invoice configuration', async () => {
    const h = harness({ supported: false });
    await h.worker.execute(event());
    expect(h.requests.create).not.toHaveBeenCalled();
    expect(h.portalFlows.execute).not.toHaveBeenCalled();
  });

  it('persists an explicit missing-document state without opening the portal', async () => {
    const h = harness();
    await h.worker.execute(event({ documentNumber: undefined }));
    expect(h.requests.create).toHaveBeenCalledOnce();
    expect(h.requests.markNeedsDocumentData).toHaveBeenCalledWith(ids.workspace, ids.request, 'BARCODE_REQUIRED');
    expect(h.requests.tryStart).not.toHaveBeenCalled();
    expect(h.portalFlows.execute).not.toHaveBeenCalled();
  });

  it('does not create a request without a requesting user', async () => {
    const h = harness();
    await h.worker.execute(event({ requestedByUserId: undefined }));
    expect(h.requests.create).not.toHaveBeenCalled();
  });

  it('uses a separated barcode identifier instead of card last4 or printed ticket number', async () => {
    const h = harness();
    await h.worker.execute(event({
      documentNumber: '2518',
      paymentLast4: '0633',
      documentIdentifiers: [
        { type: 'TICKET_NUMBER', value: '2518' },
        { type: 'AUTHORIZATION_NUMBER', value: '842777' },
        { type: 'BARCODE', value: '71901102120708261246' },
      ],
    }));
    expect(h.requests.create).toHaveBeenCalledWith(expect.objectContaining({
      documentNumber: '71901102120708261246',
    }));
    expect((h.adapter.validatePreflight as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
      .toBeLessThan((h.requests.tryStart as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!);
  });

  it('does not consume an attempt and records missing data when BARCODE cannot be resolved', async () => {
    const h = harness();
    (h.adapter.resolveDocumentNumber as ReturnType<typeof vi.fn>).mockReturnValueOnce(undefined);
    await h.worker.execute(event({ documentNumber: '2518', paymentLast4: '0633' }));
    expect(h.requests.create).toHaveBeenCalledOnce();
    expect(h.requests.markNeedsDocumentData).toHaveBeenCalledWith(ids.workspace, ids.request, 'BARCODE_REQUIRED');
    expect(h.requests.tryStart).not.toHaveBeenCalled();
    expect(h.portalFlows.execute).not.toHaveBeenCalled();
  });

  it('classifies an already invoiced merchant response separately from a technical failure', async () => {
    const h = harness();
    (h.portalFlows.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ outcome: 'ALREADY_COMPLETED' });
    await h.worker.execute(event());
    expect(h.requests.markAlreadyCompleted).toHaveBeenCalledWith(ids.workspace, ids.request, ids.attempt);
    expect(h.requests.fail).not.toHaveBeenCalled();
  });

  it('selects automation through merchant configuration rather than Costco logic in the worker', async () => {
    const h = harness();
    await h.worker.execute(event({ merchantName: 'Costco Wholesale' }));
    expect(h.adapters.findByMerchantKey).toHaveBeenCalledWith('COSTCO');
    expect(h.adapter.buildInvoiceFlowInput).toHaveBeenCalledWith(expect.objectContaining({
      documentNumber: 'ticket-number', totalAmount: '6893.12',
    }));
  });

  it('registers itself for ExpenseRegistered', () => {
    const h = harness();
    expect(h.registry.findByEvent(EXPENSE_REGISTERED)).toContain(h.worker);
  });

  it('retries the same FAILED InvoiceRequest through the configured PAE flow', async () => {
    const h = harness();
    await expect(h.worker.retry(ids.request)).resolves.toBe('STARTED');
    expect(h.requests.tryRetryStart).toHaveBeenCalledWith(ids.workspace, ids.request, 'CONFIGURED_ADAPTER');
    expect(h.adapter.buildInvoiceFlowInput).toHaveBeenCalledWith(expect.objectContaining({
      documentNumber: 'ticket-number', totalAmount: '6893.12',
    }));
    expect(h.portalFlows.execute).toHaveBeenCalledOnce();
  });

  it('does not run a duplicate retry when the atomic claim is unavailable', async () => {
    const h = harness();
    (h.requests.tryRetryStart as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await expect(h.worker.retry(ids.request)).resolves.toBe('NOT_RETRYABLE');
    expect(h.portalFlows.execute).not.toHaveBeenCalled();
  });
});
