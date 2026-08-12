import { Injectable } from '@nestjs/common';
import { InvoiceDocumentType, InvoiceInboundMessageStatus, InvoiceRequestStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { PortalAdapterRegistry } from '../portal-automation/portal-adapter.registry';
import { InvoiceDownloadManagerService } from './invoice-download-manager.service';
import { InvoiceRequestsService } from './invoice-requests.service';

export type InboundInvoiceEmail = {
  provider: string;
  providerMessageId: string;
  from: string;
  to?: string;
  subject: string;
  textBody?: string;
  receivedAt: Date;
  attachments: readonly { fileName: string; mimeType: string; bytes: Uint8Array }[];
};

export type InboundInvoiceEmailResult =
  | { status: 'DUPLICATE'; invoiceRequestId?: string }
  | { status: 'UNMATCHED' }
  | { status: 'MATCHED' | 'COMPLETED'; invoiceRequestId: string };

/** Channel-neutral entry point. Gmail, Outlook or IMAP adapters only translate messages into this contract. */
@Injectable()
export class InboundInvoiceEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adapters: PortalAdapterRegistry,
    private readonly downloads: InvoiceDownloadManagerService,
    private readonly requests: InvoiceRequestsService,
  ) {}

  async receive(message: InboundInvoiceEmail): Promise<InboundInvoiceEmailResult> {
    const duplicate = await this.prisma.invoiceInboundMessage.findUnique({
      where: { provider_providerMessageId: { provider: message.provider, providerMessageId: message.providerMessageId } },
    });
    if (duplicate) return { status: 'DUPLICATE', ...(duplicate.invoiceRequestId ? { invoiceRequestId: duplicate.invoiceRequestId } : {}) };

    const searchable = normalize(`${message.subject} ${message.textBody ?? ''}`);
    const candidates = await this.prisma.invoiceRequest.findMany({
      where: {
        status: InvoiceRequestStatus.ACCEPTED_PENDING,
        deliveryStrategy: 'EMAIL_DELIVERY',
        ...(message.to ? { deliveryEmail: message.to.trim().toLowerCase() } : {}),
        documentsDeadline: { gt: message.receivedAt },
      },
      include: { attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 }, documents: true },
      take: 25,
    });
    const ranked = candidates.map((request) => ({ request, score: correlationScore(request, message, searchable) }))
      .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
    const match = ranked.length > 0 && (ranked.length === 1 || ranked[0]!.score > ranked[1]!.score) ? ranked[0]!.request : undefined;
    const hashes = { subjectHash: sha256(message.subject), ...(message.textBody ? { bodyHash: sha256(message.textBody) } : {}) };

    let inbound;
    try {
      inbound = await this.prisma.invoiceInboundMessage.create({ data: {
        provider: message.provider, providerMessageId: message.providerMessageId,
        senderAddress: message.from.trim().toLowerCase(),
        ...(message.to ? { recipientAddress: message.to.trim().toLowerCase() } : {}),
        ...hashes, receivedAt: message.receivedAt,
        status: match ? InvoiceInboundMessageStatus.MATCHED : InvoiceInboundMessageStatus.UNMATCHED,
        ...(match ? { invoiceRequestId: match.id } : {}),
        correlation: match ? { merchantKey: match.merchantKey, signalsMatched: matchedSignals(match, searchable) } : Prisma.JsonNull,
      } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.invoiceInboundMessage.findUniqueOrThrow({
        where: { provider_providerMessageId: { provider: message.provider, providerMessageId: message.providerMessageId } },
      });
      return { status: 'DUPLICATE', ...(existing.invoiceRequestId ? { invoiceRequestId: existing.invoiceRequestId } : {}) };
    }
    if (!match) return { status: 'UNMATCHED' };
    const attempt = match.attempts[0];
    if (!attempt) return { status: 'MATCHED', invoiceRequestId: match.id };

    await this.downloads.persist({
      workspaceId: match.workspaceId, invoiceRequestId: match.id, attemptId: attempt.id,
      documents: message.attachments.map((attachment) => ({ ...attachment, source: 'EMAIL_ATTACHMENT' as const })),
    });
    const allDocuments = await this.prisma.invoiceDocument.findMany({ where: { invoiceRequestId: match.id } });
    const policy = this.adapters.findByAdapterKey(attempt.adapterKey)?.getPendingDocumentPolicy?.();
    const expected = policy?.expectedDocumentTypes ?? ['XML', 'PDF'];
    const complete = expected.every((type) => allDocuments.some((document) => document.documentType === type as InvoiceDocumentType));
    await this.prisma.invoiceInboundMessage.update({
      where: { id: inbound.id }, data: { status: complete ? InvoiceInboundMessageStatus.PROCESSED : InvoiceInboundMessageStatus.MATCHED },
    });
    if (!complete) return { status: 'MATCHED', invoiceRequestId: match.id };
    await this.requests.completeWithPersistedDocuments(match.workspaceId, match.id, attempt.id, allDocuments.map(({ id }) => id));
    return { status: 'COMPLETED', invoiceRequestId: match.id };
  }
}

function correlationScore(request: {
  merchantKey: string; deliveryEmail: string | null; documentNumber: string | null; externalReference: string | null;
  billingRfcSnapshot: string | null; requestedAmountSnapshot: Prisma.Decimal | null;
}, message: InboundInvoiceEmail, searchable: string): number {
  let score = 0;
  if (message.to && request.deliveryEmail === message.to.trim().toLowerCase()) score += 4;
  if (normalize(message.from).includes(normalize(request.merchantKey))) score += 2;
  for (const signal of correlationValues(request)) if (searchable.includes(normalize(signal))) score += 3;
  return score;
}

function matchedSignals(request: Parameters<typeof correlationValues>[0], searchable: string): string[] {
  return correlationValues(request).filter((signal) => searchable.includes(normalize(signal))).map((signal) => signal === request.billingRfcSnapshot ? 'RFC' : signal === request.documentNumber ? 'COMPROBANTE' : signal === request.externalReference ? 'EXTERNAL_REFERENCE' : 'AMOUNT');
}

function correlationValues(request: {
  documentNumber: string | null; externalReference: string | null; billingRfcSnapshot: string | null;
  requestedAmountSnapshot: Prisma.Decimal | null;
}): string[] {
  return [request.documentNumber, request.externalReference, request.billingRfcSnapshot, request.requestedAmountSnapshot?.toString()].filter((value): value is string => Boolean(value));
}

function normalize(value: string): string { return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase(); }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
