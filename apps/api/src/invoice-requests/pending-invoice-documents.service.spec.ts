/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { ConfigService } from '@nestjs/config';
import { InvoiceRequestStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PendingInvoiceDocumentsService } from './pending-invoice-documents.service';

function harness(overrides: Record<string, unknown> = {}) {
  const request: any = {
    id: 'request', workspaceId: 'workspace', status: InvoiceRequestStatus.ACCEPTED_PENDING,
    documentsDeadline: new Date(Date.now() + 72 * 3_600_000), attempts: [{ id: 'attempt', adapterKey: 'COSTCO' }],
    ...overrides,
  };
  const prisma: any = { invoiceRequest: { findUnique: vi.fn().mockResolvedValue(request), findMany: vi.fn().mockResolvedValue([request]) } };
  const adapter = { getPendingDocumentPolicy: () => ({ strategy: 'PORTAL_POLL', windowMs: 72 * 3_600_000, initialBackoffMs: 1000, maxBackoffMs: 10_000, maxChecks: 12 }) };
  const adapters: any = { findByAdapterKey: vi.fn().mockReturnValue(adapter) };
  const downloads: any = { persist: vi.fn().mockResolvedValue([{ id: 'document' }]) };
  const requests: any = { markAcceptedPending: vi.fn(), markDocumentsTimeout: vi.fn(), reschedulePending: vi.fn(), completeWithPersistedDocuments: vi.fn() };
  return { service: new PendingInvoiceDocumentsService(prisma, adapters, downloads, requests, new ConfigService()), downloads, requests };
}

describe('PendingInvoiceDocumentsService', () => {
  it('keeps an accepted request pending with idempotent backoff when no documents exist', async () => {
    const h = harness();
    h.service.registerResolver('COSTCO', vi.fn().mockResolvedValue({ documents: [] }));
    await expect(h.service.checkOne('request')).resolves.toBe('PENDING');
    expect(h.requests.reschedulePending).toHaveBeenCalledOnce();
    expect(h.downloads.persist).not.toHaveBeenCalled();
  });

  it('persists later documents and completes the existing request', async () => {
    const h = harness();
    h.service.registerResolver('COSTCO', vi.fn().mockResolvedValue({ documents: [
      { fileName: 'invoice.xml', mimeType: 'application/xml', bytes: Buffer.from('<xml/>'), source: 'HTTP_RESPONSE' },
    ] }));
    await expect(h.service.checkOne('request')).resolves.toBe('COMPLETED');
    expect(h.requests.completeWithPersistedDocuments).toHaveBeenCalledWith('workspace', 'request', 'attempt', ['document']);
  });

  it('uses an explicit timeout state after the pending window', async () => {
    const h = harness({ documentsDeadline: new Date(Date.now() - 1) });
    await expect(h.service.checkOne('request')).resolves.toBe('TIMEOUT');
    expect(h.requests.markDocumentsTimeout).toHaveBeenCalledWith('workspace', 'request');
  });

  it('does not poll the portal while an email-delivery request is awaiting documents', async () => {
    const h = harness({ deliveryStrategy: 'EMAIL_DELIVERY' });
    h.service.registerResolver('COSTCO', vi.fn());
    await expect(h.service.checkOne('request')).resolves.toBe('PENDING');
    expect(h.downloads.persist).not.toHaveBeenCalled();
    expect(h.requests.reschedulePending).not.toHaveBeenCalled();
  });
});
