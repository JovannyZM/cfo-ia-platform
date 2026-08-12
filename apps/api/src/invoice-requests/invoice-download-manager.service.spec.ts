/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { describe, expect, it, vi } from 'vitest';
import { InvoiceDownloadManagerService } from './invoice-download-manager.service';

describe('InvoiceDownloadManagerService', () => {
  it('persists XML and PDF privately with hashes and deduplicates repeated bytes', async () => {
    const records: any[] = [];
    const prisma: any = {
      invoiceRequest: { findFirst: vi.fn().mockResolvedValue({ id: 'request', requestedByUserId: 'user', workspace: { accountId: 'account' } }) },
      invoiceDocument: {
        findUnique: vi.fn(({ where }: any) => Promise.resolve(records.find((item) => item.checksum === where.invoiceRequestId_checksum.checksum))),
        create: vi.fn(({ data }: any) => { const row = { id: `doc-${records.length}`, ...data }; records.push(row); return Promise.resolve(row); }),
        findUniqueOrThrow: vi.fn(), findMany: vi.fn(),
      },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const storage: any = { put: vi.fn(({ byteLength }: Uint8Array) => Promise.resolve({ reference: `private://${byteLength}`, sizeBytes: byteLength, sha256: 'x' })), delete: vi.fn() };
    const service = new InvoiceDownloadManagerService(prisma, storage);
    const documents = [
      { fileName: 'invoice.xml', mimeType: 'application/xml', bytes: Buffer.from('<xml/>'), source: 'HTTP_RESPONSE' as const },
      { fileName: 'invoice.pdf', mimeType: 'application/pdf', bytes: Buffer.from('%PDF-test'), source: 'PLAYWRIGHT_DOWNLOAD' as const },
    ];
    await service.persist({ workspaceId: 'workspace', invoiceRequestId: 'request', attemptId: 'attempt', documents });
    await service.persist({ workspaceId: 'workspace', invoiceRequestId: 'request', attemptId: 'attempt', documents });
    expect(records.map(({ documentType }) => documentType)).toEqual(['XML', 'PDF']);
    expect(records).toHaveLength(2);
    expect(records.every(({ checksum }) => /^[a-f0-9]{64}$/u.test(checksum))).toBe(true);
  });
});
