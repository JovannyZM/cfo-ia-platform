/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoiceRequestStatus, TaxProfileStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma.service';
import { INVOICE_AUDIT_ACTIONS, InvoiceRequestsService } from './invoice-requests.service';

const ids = {
  workspace: '00000000-0000-4000-8000-000000000001',
  expense: '00000000-0000-4000-8000-000000000002',
  tax: '00000000-0000-4000-8000-000000000003',
  user: '00000000-0000-4000-8000-000000000004',
  request: '00000000-0000-4000-8000-000000000005',
  attempt: '00000000-0000-4000-8000-000000000006',
};

function input(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: ids.workspace, expenseId: ids.expense, merchantName: 'Costco', merchantKey: 'costco',
    channel: 'INTERNAL', taxProfileId: ids.tax, requestedByUserId: ids.user, ...overrides,
  };
}

function harness(options: {
  taxStatus?: TaxProfileStatus | null;
  merchant?: boolean;
  existing?: Record<string, unknown> | null;
  requestStatus?: InvoiceRequestStatus;
} = {}) {
  const audits: Array<Record<string, unknown>> = [];
  const documents: Array<Record<string, unknown>> = [];
  const attempts: Array<Record<string, unknown>> = [];
  let request: Record<string, unknown> = {
    id: ids.request, workspaceId: ids.workspace, requestedByUserId: ids.user,
    status: options.requestStatus ?? InvoiceRequestStatus.READY,
    workspace: { accountId: 'account-id' }, merchantKey: 'COSTCO',
  };
  const prisma: any = {
    workspace: { findUnique: vi.fn().mockResolvedValue({ accountId: 'account-id' }) },
    merchantInvoiceProfile: { findFirst: vi.fn().mockResolvedValue(options.merchant === false ? null : { merchantKey: 'COSTCO', active: true }) },
    expense: {
      findFirst: vi.fn().mockResolvedValue({ id: ids.expense }),
      update: vi.fn(({ data }: any) => Promise.resolve({ id: ids.expense, ...data })),
    },
    taxProfile: { findFirst: vi.fn().mockResolvedValue(options.taxStatus === null ? null : {
      id: ids.tax, status: options.taxStatus ?? TaxProfileStatus.ACTIVE,
      approvedAt: new Date(), postalCode: '91000', taxRegime: '601', cfdiUse: 'G03', billingEmail: 'billing@example.com',
    }) },
    invoiceRequest: {
      findFirst: vi.fn(({ where }: any) => Promise.resolve(where.id ? request : (options.existing ?? null))),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(({ data }: any) => {
        request = { id: ids.request, ...data };
        return Promise.resolve(request);
      }),
      update: vi.fn(({ data }: any) => {
        request = { ...request, ...data };
        return Promise.resolve(request);
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    invoiceRequestAttempt: {
      count: vi.fn(() => Promise.resolve(attempts.length)),
      create: vi.fn(({ data }: any) => {
        const attempt = { id: ids.attempt, ...data };
        attempts.push(attempt);
        return Promise.resolve(attempt);
      }),
      update: vi.fn(({ data }: any) => {
        Object.assign(attempts[0] ?? {}, data);
        return Promise.resolve(attempts[0]);
      }),
    },
    invoiceDocument: { create: vi.fn(({ data }: any) => { documents.push(data); return Promise.resolve(data); }) },
    supplementalExpenseEvidence: {
      upsert: vi.fn(({ create }: any) => Promise.resolve({ id: 'supplemental-evidence', ...create })),
    },
    auditEvent: { create: vi.fn(({ data }: any) => { audits.push(data); return Promise.resolve(data); }) },
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  return { service: new InvoiceRequestsService(prisma as PrismaService), prisma, audits, documents, attempts, getRequest: () => request };
}

const document = (suffix: string) => ({
  fileName: `invoice.${suffix}`, storageReference: `pending://${suffix}`,
  checksum: 'a'.repeat(64),
});

describe('InvoiceRequestsService', () => {
  it('creates a READY request for a supported merchant and approved TaxProfile', async () => {
    const { service, audits } = harness();
    const created = await service.create(input());
    expect(created).toMatchObject({ merchantKey: 'COSTCO', status: 'READY' });
    expect(audits[0]).toMatchObject({ action: INVOICE_AUDIT_ACTIONS.CREATED });
  });

  it('creates NEEDS_TAX_DATA when TaxProfile is missing', async () => {
    const { service } = harness();
    expect(await service.create(input({ taxProfileId: undefined }))).toMatchObject({ status: 'NEEDS_TAX_DATA' });
  });

  it('rejects a TaxProfile that is not approved', async () => {
    const { service } = harness({ taxStatus: TaxProfileStatus.PENDING_VERIFICATION });
    await expect(service.create(input())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts Costco or Chedraui profiles and rejects unsupported merchants', async () => {
    await expect(harness().service.create(input({ merchantKey: 'CHEDRAUI' }))).resolves.toBeDefined();
    await expect(harness({ merchant: false }).service.create(input({ merchantKey: 'UNKNOWN' })))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the existing request idempotently', async () => {
    const existing = { id: 'existing', status: 'READY' };
    const { service, prisma } = harness({ existing });
    expect(await service.create(input())).toBe(existing);
    expect(prisma.invoiceRequest.create).not.toHaveBeenCalled();
  });

  it('attaches supplemental evidence, repairs identifiers and preserves previous attempts', async () => {
    const h = harness({ requestStatus: InvoiceRequestStatus.FAILED });
    h.prisma.invoiceRequest.findFirst.mockResolvedValueOnce({
      id: ids.request, workspaceId: ids.workspace, requestedByUserId: ids.user,
      status: InvoiceRequestStatus.FAILED, documentNumber: '2518',
      workspace: { accountId: 'account-id' }, attempts: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }, { id: 'a4' }],
      expense: {
        id: ids.expense, merchantName: 'Costco', originalAmount: '1383.26',
        occurredAt: new Date('2026-08-07T13:37:00.000Z'), paymentLast4: '0633', evidenceSha256: 'a'.repeat(64),
      },
    });
    const result = await h.service.attachSupplementalEvidence({
      workspaceId: ids.workspace, invoiceRequestId: ids.request, providedByUserId: ids.user,
      sha256: 'b'.repeat(64), merchantName: 'Costco de México, S.A. de C.V.', originalAmount: '1383.26',
      occurredAt: '2026-08-07T19:37:00.000Z', paymentLast4: '0633', documentNumber: '71901102520807261337',
      documentIdentifiers: [
        { type: 'TICKET_NUMBER', value: '2518' },
        { type: 'AUTHORIZATION_NUMBER', value: '744265' },
        { type: 'BARCODE', value: '71901102520807261337' },
      ],
    });
    expect(result).toMatchObject({ attemptsPreserved: 4, request: { documentNumber: '71901102520807261337' } });
    expect(h.prisma.expense.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { documentIdentifiers: expect.arrayContaining([{ type: 'BARCODE', value: '71901102520807261337' }]) },
    }));
    expect(h.audits[0]).toMatchObject({
      action: INVOICE_AUDIT_ACTIONS.SUPPLEMENTAL_EVIDENCE_ATTACHED,
      metadata: expect.objectContaining({ originalEvidenceSha256Preserved: 'a'.repeat(64), attemptsPreserved: 4 }),
    });
  });

  it('registers and audits an attempt', async () => {
    const { service, attempts, audits } = harness();
    const result = await service.start(ids.workspace, ids.request, 'costco-adapter');
    expect(result.attempt).toMatchObject({ attemptNumber: 1, status: 'PROCESSING' });
    expect(attempts).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: INVOICE_AUDIT_ACTIONS.STARTED });
  });

  it('atomically claims a READY request once before starting automated PAE', async () => {
    const h = harness();
    const started = await h.service.tryStart(ids.workspace, ids.request, 'configured-adapter');
    expect(started?.attempt).toMatchObject({ attemptNumber: 1, adapterKey: 'configured-adapter' });
    expect(h.prisma.invoiceRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: ids.request, status: InvoiceRequestStatus.READY }),
    }));
  });

  it('does not create a duplicate attempt when another execution already claimed the request', async () => {
    const h = harness();
    h.prisma.invoiceRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(h.service.tryStart(ids.workspace, ids.request, 'configured-adapter')).resolves.toBeNull();
    expect(h.prisma.invoiceRequestAttempt.create).not.toHaveBeenCalled();
  });

  it('atomically claims a FAILED request and preserves the previous attempt on retry', async () => {
    const h = harness({ requestStatus: InvoiceRequestStatus.FAILED });
    h.attempts.push({ id: 'previous-attempt', status: 'FAILED' });
    const result = await h.service.tryRetryStart(ids.workspace, ids.request, 'configured-adapter');
    expect(result?.attempt).toMatchObject({ attemptNumber: 2, adapterKey: 'configured-adapter' });
    expect(h.attempts).toHaveLength(2);
    expect(h.prisma.invoiceRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: ids.request, status: InvoiceRequestStatus.FAILED }),
    }));
    expect(h.audits[0]).toMatchObject({
      action: INVOICE_AUDIT_ACTIONS.STARTED,
      metadata: expect.objectContaining({ retry: true, attemptNumber: 2 }),
    });
  });

  it('rejects a concurrent retry claim without creating another attempt', async () => {
    const h = harness({ requestStatus: InvoiceRequestStatus.FAILED });
    h.prisma.invoiceRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(h.service.tryRetryStart(ids.workspace, ids.request, 'configured-adapter')).resolves.toBeNull();
    expect(h.prisma.invoiceRequestAttempt.create).not.toHaveBeenCalled();
  });

  it('records an auditable failure', async () => {
    const h = harness({ requestStatus: InvoiceRequestStatus.PROCESSING });
    h.attempts.push({ id: ids.attempt });
    await h.service.fail(ids.workspace, ids.request, ids.attempt, 'PORTAL_ERROR', 'safe failure');
    expect(h.getRequest()).toMatchObject({ status: 'FAILED', failureReason: 'safe failure' });
    expect(h.audits[0]).toMatchObject({ action: INVOICE_AUDIT_ACTIONS.FAILED });
  });

  it.each([
    ['XML', { xmlDocument: document('xml') }, ['XML']],
    ['PDF', { pdfDocument: document('pdf') }, ['PDF']],
    ['both', { xmlDocument: document('xml'), pdfDocument: document('pdf') }, ['XML', 'PDF']],
  ])('completes successfully with %s', async (_label, completion, expected) => {
    const h = harness({ requestStatus: InvoiceRequestStatus.PROCESSING });
    h.attempts.push({ id: ids.attempt });
    await h.service.complete(ids.workspace, ids.request, ids.attempt, completion);
    expect(h.documents.map(({ documentType }) => documentType)).toEqual(expected);
    expect(h.getRequest()).toMatchObject({ status: 'COMPLETED' });
    expect(h.audits[0]).toMatchObject({ action: INVOICE_AUDIT_ACTIONS.COMPLETED });
  });

  it('rejects an invalid state transition', async () => {
    await expect(harness({ requestStatus: InvoiceRequestStatus.COMPLETED }).service.start(
      ids.workspace, ids.request, 'adapter',
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scopes reads to Workspace authorization boundary', async () => {
    const { service, prisma } = harness();
    prisma.invoiceRequest.findFirst.mockResolvedValueOnce(null);
    await expect(service.getById('other-workspace', ids.request)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.invoiceRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ids.request, workspaceId: 'other-workspace' },
    }));
  });
});
