/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { describe, expect, it, vi } from 'vitest';
import { InboundInvoiceEmailService } from './inbound-invoice-email.service';

function harness(options: { duplicate?: boolean; existingTypes?: string[] } = {}) {
  const request: any = {
    id: 'request', workspaceId: 'workspace', merchantKey: 'COSTCO', deliveryEmail: 'billing@example.com',
    documentNumber: '71901102520807261337', externalReference: 'folio-1', billingRfcSnapshot: 'RFC-SNAPSHOT',
    requestedAmountSnapshot: { toString: () => '1383.26' }, attempts: [{ id: 'attempt', adapterKey: 'COSTCO_INVOICE_READ_ONLY' }], documents: [],
  };
  const inboundRows: any[] = options.duplicate ? [{ id: 'inbound', invoiceRequestId: 'request' }] : [];
  const docs = (options.existingTypes ?? []).map((documentType, index) => ({ id: `existing-${index}`, documentType }));
  const prisma: any = {
    invoiceInboundMessage: {
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(inboundRows[0] ?? null)), findUniqueOrThrow: vi.fn(),
      create: vi.fn(({ data }: any) => { const row = { id: 'inbound', ...data }; inboundRows.push(row); return Promise.resolve(row); }),
      update: vi.fn().mockResolvedValue({}),
    },
    invoiceRequest: { findMany: vi.fn().mockResolvedValue([request]) },
    invoiceDocument: { findMany: vi.fn().mockImplementation(() => Promise.resolve(docs)) },
  };
  const adapters: any = { findByAdapterKey: vi.fn().mockReturnValue({ getPendingDocumentPolicy: () => ({ strategy: 'EMAIL_DELIVERY', expectedDocumentTypes: ['XML', 'PDF'] }) }) };
  const downloads: any = { persist: vi.fn().mockImplementation(({ documents }: any) => {
    for (const document of documents) docs.push({ id: `doc-${docs.length}`, documentType: document.fileName.endsWith('.xml') ? 'XML' : document.fileName.endsWith('.pdf') ? 'PDF' : 'OTHER' });
    return Promise.resolve(docs);
  }) };
  const requests: any = { completeWithPersistedDocuments: vi.fn().mockResolvedValue({}) };
  return { service: new InboundInvoiceEmailService(prisma, adapters, downloads, requests), downloads, requests };
}

const message = (attachments: readonly { fileName: string; mimeType: string; bytes: Uint8Array }[]) => ({
  provider: 'fake-mail', providerMessageId: 'message-1', from: 'facturacion@costco.example', to: 'billing@example.com',
  subject: 'Factura folio-1 comprobante 71901102520807261337', textBody: 'RFC-SNAPSHOT total 1383.26',
  receivedAt: new Date('2026-08-07T20:00:00Z'), attachments,
});

describe('InboundInvoiceEmailService', () => {
  it('correlates a simulated email and completes after XML and PDF are persisted', async () => {
    const h = harness();
    await expect(h.service.receive(message([
      { fileName: 'invoice.xml', mimeType: 'application/xml', bytes: Buffer.from('<xml/>') },
      { fileName: 'invoice.pdf', mimeType: 'application/pdf', bytes: Buffer.from('%PDF') },
    ]))).resolves.toEqual({ status: 'COMPLETED', invoiceRequestId: 'request' });
    expect(h.downloads.persist).toHaveBeenCalledOnce();
    expect(h.requests.completeWithPersistedDocuments).toHaveBeenCalledOnce();
  });

  it('keeps the request pending when only one expected attachment arrives', async () => {
    const h = harness();
    await expect(h.service.receive(message([
      { fileName: 'invoice.xml', mimeType: 'application/xml', bytes: Buffer.from('<xml/>') },
    ]))).resolves.toEqual({ status: 'MATCHED', invoiceRequestId: 'request' });
    expect(h.requests.completeWithPersistedDocuments).not.toHaveBeenCalled();
  });

  it('ignores duplicate provider messages and their duplicate attachments', async () => {
    const h = harness({ duplicate: true });
    await expect(h.service.receive(message([
      { fileName: 'invoice.xml', mimeType: 'application/xml', bytes: Buffer.from('<xml/>') },
    ]))).resolves.toEqual({ status: 'DUPLICATE', invoiceRequestId: 'request' });
    expect(h.downloads.persist).not.toHaveBeenCalled();
  });
});
