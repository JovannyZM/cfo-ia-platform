import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  InvoiceDocumentType,
  InvoiceRequestAttemptStatus,
  InvoiceRequestStatus,
  TaxProfileStatus,
} from '@prisma/client';
import { canTransitionInvoiceRequest } from '@cfo-ia/domain';
import { PrismaService } from '../prisma.service';
import {
  createInvoiceRequestSchema,
  invoiceCompletionSchema,
  type CreateInvoiceRequestInput,
  type InvoiceCompletionInput,
} from './invoice-request.schemas';

export const INVOICE_AUDIT_ACTIONS = {
  CREATED: 'INVOICE_REQUEST_CREATED',
  STARTED: 'INVOICE_REQUEST_STARTED',
  COMPLETED: 'INVOICE_REQUEST_COMPLETED',
  FAILED: 'INVOICE_REQUEST_FAILED',
  CANCELLED: 'INVOICE_REQUEST_CANCELLED',
} as const;

@Injectable()
export class InvoiceRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  list(workspaceId: string) {
    return this.prisma.invoiceRequest.findMany({
      where: { workspaceId },
      include: { taxProfile: true, documents: true, attempts: { orderBy: { attemptNumber: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(workspaceId: string, invoiceRequestId: string) {
    const request = await this.prisma.invoiceRequest.findFirst({
      where: { id: invoiceRequestId, workspaceId },
      include: { taxProfile: true, documents: true, attempts: { orderBy: { attemptNumber: 'asc' } } },
    });
    if (!request) throw new NotFoundException('Invoice request not found');
    return request;
  }

  async create(input: CreateInvoiceRequestInput) {
    const parsed = createInvoiceRequestSchema.parse(input);
    const merchantKey = parsed.merchantKey.trim().toUpperCase();
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: input.workspaceId }, select: { accountId: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    const merchant = await this.prisma.merchantInvoiceProfile.findFirst({
      where: { merchantKey, active: true },
    });
    if (!merchant) throw new BadRequestException('Merchant invoice profile is not supported');
    if (parsed.expenseId) {
      const expense = await this.prisma.expense.findFirst({ where: { id: parsed.expenseId, workspaceId: input.workspaceId } });
      if (!expense) throw new BadRequestException('Expense does not belong to Workspace');
    }
    const taxProfile = parsed.taxProfileId
      ? await this.prisma.taxProfile.findFirst({
          where: { id: parsed.taxProfileId, workspaceId: input.workspaceId, deletedAt: null },
        })
      : null;
    if (parsed.taxProfileId && (!taxProfile || taxProfile.status !== TaxProfileStatus.ACTIVE ||
      !taxProfile.approvedAt || !taxProfile.postalCode || !taxProfile.taxRegime ||
      !taxProfile.cfdiUse || !taxProfile.billingEmail)) {
      throw new BadRequestException('TaxProfile is not approved');
    }
    const sourceFilter = parsed.expenseId
      ? { expenseId: parsed.expenseId }
      : { sourceEvidenceId: parsed.sourceEvidenceId! };
    const existing = await this.prisma.invoiceRequest.findFirst({
      where: {
        workspaceId: input.workspaceId, merchantKey,
        taxProfileId: parsed.taxProfileId ?? null, ...sourceFilter,
      },
    });
    if (existing) return existing;
    const status = taxProfile ? InvoiceRequestStatus.READY : InvoiceRequestStatus.NEEDS_TAX_DATA;
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.invoiceRequest.create({
        data: {
          workspaceId: input.workspaceId,
          ...(parsed.expenseId ? { expenseId: parsed.expenseId } : {}),
          ...(parsed.sourceEvidenceId ? { sourceEvidenceId: parsed.sourceEvidenceId } : {}),
          merchantName: parsed.merchantName.trim(), merchantKey, status,
          channel: parsed.channel.trim().toUpperCase(),
          ...(parsed.taxProfileId ? { taxProfileId: parsed.taxProfileId } : {}),
          requestedByUserId: parsed.requestedByUserId,
        },
      });
      await tx.auditEvent.create({ data: {
        accountId: workspace.accountId, actorUserId: parsed.requestedByUserId,
        action: INVOICE_AUDIT_ACTIONS.CREATED, entityType: 'InvoiceRequest', entityId: request.id,
        metadata: { status, merchantKey },
      } });
      return request;
    });
  }

  async start(workspaceId: string, requestId: string, adapterKey: string) {
    const request = await this.scopedRequest(workspaceId, requestId);
    this.assertTransition(request.status, InvoiceRequestStatus.PROCESSING);
    return this.prisma.$transaction(async (tx) => {
      const attemptNumber = await tx.invoiceRequestAttempt.count({ where: { invoiceRequestId: requestId } }) + 1;
      const attempt = await tx.invoiceRequestAttempt.create({ data: {
        invoiceRequestId: requestId, attemptNumber, adapterKey,
        status: InvoiceRequestAttemptStatus.PROCESSING,
      } });
      const updated = await tx.invoiceRequest.update({
        where: { id: requestId }, data: { status: InvoiceRequestStatus.PROCESSING, failureReason: null },
      });
      await tx.auditEvent.create({ data: {
        accountId: request.workspace.accountId, actorUserId: request.requestedByUserId,
        action: INVOICE_AUDIT_ACTIONS.STARTED, entityType: 'InvoiceRequest', entityId: requestId,
        metadata: { attemptId: attempt.id, attemptNumber, adapterKey },
      } });
      return { request: updated, attempt };
    });
  }

  async complete(workspaceId: string, requestId: string, attemptId: string, input: InvoiceCompletionInput) {
    const parsed = invoiceCompletionSchema.parse(input);
    const request = await this.scopedRequest(workspaceId, requestId);
    this.assertTransition(request.status, InvoiceRequestStatus.COMPLETED);
    return this.prisma.$transaction(async (tx) => {
      const documents = [
        ...(parsed.xmlDocument ? [{ type: InvoiceDocumentType.XML, ...parsed.xmlDocument }] : []),
        ...(parsed.pdfDocument ? [{ type: InvoiceDocumentType.PDF, ...parsed.pdfDocument }] : []),
      ];
      for (const document of documents) {
        await tx.invoiceDocument.create({ data: {
          invoiceRequestId: requestId, documentType: document.type,
          fileName: document.fileName, storageReference: document.storageReference,
          checksum: document.checksum.toLowerCase(),
        } });
      }
      await tx.invoiceRequestAttempt.update({ where: { id: attemptId }, data: {
        status: InvoiceRequestAttemptStatus.COMPLETED, finishedAt: new Date(),
      } });
      const updated = await tx.invoiceRequest.update({ where: { id: requestId }, data: {
        status: InvoiceRequestStatus.COMPLETED, completedAt: new Date(), failureReason: null,
      } });
      await tx.auditEvent.create({ data: {
        accountId: request.workspace.accountId, actorUserId: request.requestedByUserId,
        action: INVOICE_AUDIT_ACTIONS.COMPLETED, entityType: 'InvoiceRequest', entityId: requestId,
        metadata: { attemptId, documentTypes: documents.map(({ type }) => type), externalReference: parsed.externalReference },
      } });
      return updated;
    });
  }

  async fail(workspaceId: string, requestId: string, attemptId: string, errorCode: string, errorMessage: string) {
    const request = await this.scopedRequest(workspaceId, requestId);
    this.assertTransition(request.status, InvoiceRequestStatus.FAILED);
    const safeMessage = errorMessage.slice(0, 500);
    return this.prisma.$transaction(async (tx) => {
      await tx.invoiceRequestAttempt.update({ where: { id: attemptId }, data: {
        status: InvoiceRequestAttemptStatus.FAILED, finishedAt: new Date(), errorCode, errorMessage: safeMessage,
      } });
      const updated = await tx.invoiceRequest.update({ where: { id: requestId }, data: {
        status: InvoiceRequestStatus.FAILED, failureReason: safeMessage,
      } });
      await tx.auditEvent.create({ data: {
        accountId: request.workspace.accountId, actorUserId: request.requestedByUserId,
        action: INVOICE_AUDIT_ACTIONS.FAILED, entityType: 'InvoiceRequest', entityId: requestId,
        metadata: { attemptId, errorCode },
      } });
      return updated;
    });
  }

  async cancel(workspaceId: string, requestId: string, actorUserId: string, reason: string) {
    const request = await this.scopedRequest(workspaceId, requestId);
    this.assertTransition(request.status, InvoiceRequestStatus.CANCELLED);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoiceRequest.update({ where: { id: requestId }, data: {
        status: InvoiceRequestStatus.CANCELLED, failureReason: reason.slice(0, 500),
      } });
      await tx.auditEvent.create({ data: {
        accountId: request.workspace.accountId, actorUserId,
        action: INVOICE_AUDIT_ACTIONS.CANCELLED, entityType: 'InvoiceRequest', entityId: requestId,
        metadata: { reason: reason.slice(0, 500) },
      } });
      return updated;
    });
  }

  private async scopedRequest(workspaceId: string, requestId: string) {
    const request = await this.prisma.invoiceRequest.findFirst({
      where: { id: requestId, workspaceId }, include: { workspace: { select: { accountId: true } } },
    });
    if (!request) throw new NotFoundException('Invoice request not found');
    return request;
  }

  private assertTransition(from: InvoiceRequestStatus, to: InvoiceRequestStatus): void {
    if (!canTransitionInvoiceRequest(from, to)) {
      throw new BadRequestException(`Invalid invoice request transition: ${from} -> ${to}`);
    }
  }
}
