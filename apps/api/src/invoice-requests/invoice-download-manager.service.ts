import { Inject, Injectable } from '@nestjs/common';
import { InvoiceDocumentType, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { PRIVATE_OBJECT_STORAGE, type PrivateObjectStorage } from '../storage/private-object-storage';
import type { CapturedPortalDocument } from '../portal-automation/browser-provider';

@Injectable()
export class InvoiceDownloadManagerService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRIVATE_OBJECT_STORAGE) private readonly storage: PrivateObjectStorage,
  ) {}

  async persist(input: {
    workspaceId: string; invoiceRequestId: string; attemptId: string; documents: readonly CapturedPortalDocument[];
  }) {
    const request = await this.prisma.invoiceRequest.findFirst({
      where: { id: input.invoiceRequestId, workspaceId: input.workspaceId },
      include: { workspace: { select: { accountId: true } } },
    });
    if (!request) throw new Error('INVOICE_REQUEST_NOT_FOUND');
    const persisted = [];
    for (const document of input.documents) {
      const checksum = createHash('sha256').update(document.bytes).digest('hex');
      const existing = await this.prisma.invoiceDocument.findUnique({
        where: { invoiceRequestId_checksum: { invoiceRequestId: request.id, checksum } },
      });
      if (existing) { persisted.push(existing); continue; }
      const stored = await this.storage.put(`invoice-documents/${input.workspaceId}/${request.id}`, document.bytes);
      try {
        const created = await this.prisma.invoiceDocument.create({ data: {
          invoiceRequestId: request.id, attemptId: input.attemptId,
          documentType: documentType(document.mimeType, document.fileName), fileName: document.fileName,
          mimeType: document.mimeType, sizeBytes: document.bytes.byteLength,
          storageReference: stored.reference, checksum,
        } });
        persisted.push(created);
        await this.prisma.auditEvent.create({ data: {
          accountId: request.workspace.accountId, actorUserId: request.requestedByUserId,
          action: 'INVOICE_DOCUMENT_STORED', entityType: 'InvoiceDocument', entityId: created.id,
          metadata: { invoiceRequestId: request.id, attemptId: input.attemptId, documentType: created.documentType, checksum, sizeBytes: created.sizeBytes },
        } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          await this.storage.delete(stored.reference);
          const duplicate = await this.prisma.invoiceDocument.findUniqueOrThrow({
            where: { invoiceRequestId_checksum: { invoiceRequestId: request.id, checksum } },
          });
          persisted.push(duplicate);
          continue;
        }
        await this.storage.delete(stored.reference);
        throw error;
      }
    }
    return persisted;
  }

  async getForDelivery(workspaceId: string, invoiceRequestId: string) {
    return this.prisma.invoiceDocument.findMany({
      where: { invoiceRequestId, invoiceRequest: { workspaceId } },
      select: { id: true, documentType: true, fileName: true, mimeType: true, sizeBytes: true, checksum: true, storageReference: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}

function documentType(mimeType: string, fileName: string): InvoiceDocumentType {
  if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) return InvoiceDocumentType.PDF;
  if (mimeType.includes('xml') || fileName.toLowerCase().endsWith('.xml')) return InvoiceDocumentType.XML;
  return InvoiceDocumentType.OTHER;
}
