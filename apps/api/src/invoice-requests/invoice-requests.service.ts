import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  InvoiceDocumentType,
  InvoiceRequestAttemptStatus,
  InvoiceRequestStatus,
  TaxProfileStatus,
  Prisma,
} from '@prisma/client';
import { canTransitionInvoiceRequest } from '@cfo-ia/domain';
import { PrismaService } from '../prisma.service';
import {
  createInvoiceRequestSchema,
  invoiceCompletionSchema,
  type CreateInvoiceRequestInput,
  type InvoiceCompletionInput,
} from './invoice-request.schemas';
import type { PendingDocumentPolicy } from '../portal-automation/portal-adapter.registry';

export const INVOICE_AUDIT_ACTIONS = {
  CREATED: 'INVOICE_REQUEST_CREATED',
  STARTED: 'INVOICE_REQUEST_STARTED',
  COMPLETED: 'INVOICE_REQUEST_COMPLETED',
  FAILED: 'INVOICE_REQUEST_FAILED',
  CANCELLED: 'INVOICE_REQUEST_CANCELLED',
  SUPPLEMENTAL_EVIDENCE_ATTACHED: 'INVOICE_REQUEST_SUPPLEMENTAL_EVIDENCE_ATTACHED',
  WINDOW_EXPIRED: 'INVOICE_REQUEST_WINDOW_EXPIRED',
} as const;

export type SupplementalInvoiceEvidenceInput = {
  workspaceId: string;
  invoiceRequestId: string;
  providedByUserId: string;
  sha256: string;
  merchantName: string;
  originalAmount: string;
  occurredAt: string;
  paymentLast4?: string;
  documentNumber: string;
  documentIdentifiers: { type: string; value: string }[];
};

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

  async attachSupplementalEvidence(input: SupplementalInvoiceEvidenceInput) {
    if (!/^[a-f0-9]{64}$/u.test(input.sha256)) throw new BadRequestException('Invalid supplemental evidence hash');
    const barcode = input.documentIdentifiers.find(({ type, value }) =>
      type === 'BARCODE' && value === input.documentNumber && /^\d{20}$/u.test(value));
    if (!barcode) throw new BadRequestException('A verified 20 digit BARCODE is required');
    const request = await this.prisma.invoiceRequest.findFirst({
      where: { id: input.invoiceRequestId, workspaceId: input.workspaceId },
      include: { expense: true, workspace: { select: { accountId: true } }, attempts: { select: { id: true } } },
    });
    if (!request?.expense) throw new NotFoundException('Invoice request or Expense not found');
    const expense = request.expense;
    const merchantMatches = normalizeEvidenceText(expense.merchantName).includes(normalizeEvidenceText(input.merchantName))
      || normalizeEvidenceText(input.merchantName).includes(normalizeEvidenceText(expense.merchantName));
    const amountMatches = new Prisma.Decimal(input.originalAmount).equals(expense.originalAmount);
    const dateMatches = new Date(input.occurredAt).toISOString().slice(0, 10) === expense.occurredAt.toISOString().slice(0, 10);
    const cardMatches = !input.paymentLast4 || !expense.paymentLast4 || input.paymentLast4 === expense.paymentLast4;
    if (!merchantMatches || !amountMatches || !dateMatches || !cardMatches) {
      throw new BadRequestException('Supplemental evidence contradicts the existing Expense');
    }
    return this.prisma.$transaction(async (tx) => {
      const evidence = await tx.supplementalExpenseEvidence.upsert({
        where: { invoiceRequestId_sha256: { invoiceRequestId: request.id, sha256: input.sha256 } },
        create: {
          workspaceId: input.workspaceId,
          expenseId: expense.id,
          invoiceRequestId: request.id,
          sha256: input.sha256,
          source: 'USER_PROVIDED_AFTER_REGISTRATION',
          identifiers: input.documentIdentifiers,
          extractedAmount: new Prisma.Decimal(input.originalAmount),
          extractedDate: new Date(input.occurredAt),
          extractedMerchant: input.merchantName,
          providedByUserId: input.providedByUserId,
        },
        update: {},
      });
      await tx.expense.update({
        where: { id: expense.id },
        data: { documentIdentifiers: input.documentIdentifiers },
      });
      const updated = await tx.invoiceRequest.update({
        where: { id: request.id },
        data: { documentNumber: input.documentNumber },
      });
      await tx.auditEvent.create({
        data: {
          accountId: request.workspace.accountId,
          actorUserId: input.providedByUserId,
          action: INVOICE_AUDIT_ACTIONS.SUPPLEMENTAL_EVIDENCE_ATTACHED,
          entityType: 'InvoiceRequest',
          entityId: request.id,
          metadata: {
            supplementalEvidenceId: evidence.id,
            supplementalSha256: input.sha256,
            originalEvidenceSha256Preserved: expense.evidenceSha256,
            previousDocumentNumber: request.documentNumber,
            newDocumentNumber: input.documentNumber,
            identifiers: input.documentIdentifiers,
            correspondence: { merchantMatches, amountMatches, dateMatches, cardMatches },
            attemptsPreserved: request.attempts.length,
          },
        },
      });
      return { request: updated, evidence, attemptsPreserved: request.attempts.length };
    });
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
    try {
      return await this.prisma.$transaction(async (tx) => {
        const request = await tx.invoiceRequest.create({
        data: {
          workspaceId: input.workspaceId,
          ...(parsed.expenseId ? { expenseId: parsed.expenseId } : {}),
          ...(parsed.sourceEvidenceId ? { sourceEvidenceId: parsed.sourceEvidenceId } : {}),
          ...(parsed.documentNumber ? { documentNumber: parsed.documentNumber } : {}),
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.invoiceRequest.findFirstOrThrow({
          where: {
            workspaceId: input.workspaceId, merchantKey,
            taxProfileId: parsed.taxProfileId ?? null, ...sourceFilter,
          },
        });
      }
      throw error;
    }
  }

  async tryStart(workspaceId: string, requestId: string, adapterKey: string) {
    const request = await this.scopedRequest(workspaceId, requestId);
    if (request.status !== InvoiceRequestStatus.READY) return null;
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invoiceRequest.updateMany({
        where: { id: requestId, workspaceId, status: InvoiceRequestStatus.READY },
        data: { status: InvoiceRequestStatus.PROCESSING, failureReason: null },
      });
      if (claimed.count !== 1) return null;
      const attemptNumber = await tx.invoiceRequestAttempt.count({ where: { invoiceRequestId: requestId } }) + 1;
      const attempt = await tx.invoiceRequestAttempt.create({ data: {
        invoiceRequestId: requestId, attemptNumber, adapterKey,
        status: InvoiceRequestAttemptStatus.PROCESSING,
      } });
      await tx.auditEvent.create({ data: {
        accountId: request.workspace.accountId, actorUserId: request.requestedByUserId,
        action: INVOICE_AUDIT_ACTIONS.STARTED, entityType: 'InvoiceRequest', entityId: requestId,
        metadata: { attemptId: attempt.id, attemptNumber, adapterKey },
      } });
      return { request: { ...request, status: InvoiceRequestStatus.PROCESSING }, attempt };
    });
  }

  async markNeedsDocumentData(workspaceId: string, requestId: string, reason: string) {
    const request = await this.scopedRequest(workspaceId, requestId);
    if (request.status !== InvoiceRequestStatus.READY && request.status !== InvoiceRequestStatus.PENDING) return request;
    return this.prisma.invoiceRequest.update({
      where: { id: requestId },
      data: { status: InvoiceRequestStatus.NEEDS_DOCUMENT_DATA, failureReason: reason.slice(0, 500) },
    });
  }

  async markAlreadyCompleted(workspaceId: string, requestId: string, attemptId: string) {
    const request = await this.scopedRequest(workspaceId, requestId);
    return this.prisma.$transaction(async (tx) => {
      await tx.invoiceRequestAttempt.update({ where: { id: attemptId }, data: {
        status: InvoiceRequestAttemptStatus.COMPLETED, finishedAt: new Date(),
        errorCode: 'BUSINESS_ALREADY_COMPLETED', errorMessage: 'Document was previously invoiced by the merchant',
      } });
      const updated = await tx.invoiceRequest.update({ where: { id: requestId }, data: {
        status: InvoiceRequestStatus.ALREADY_INVOICED, completedAt: new Date(), failureReason: 'BUSINESS_ALREADY_COMPLETED',
      } });
      await tx.auditEvent.create({ data: {
        accountId: request.workspace.accountId, actorUserId: request.requestedByUserId,
        action: 'INVOICE_REQUEST_ALREADY_COMPLETED', entityType: 'InvoiceRequest', entityId: requestId,
        metadata: { attemptId, businessCode: '447' },
      } });
      return updated;
    });
  }

  async tryRetryStart(workspaceId: string, requestId: string, adapterKey: string) {
    const request = await this.scopedRequest(workspaceId, requestId);
    if (request.status !== InvoiceRequestStatus.FAILED) return null;
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invoiceRequest.updateMany({
        where: { id: requestId, workspaceId, status: InvoiceRequestStatus.FAILED },
        data: { status: InvoiceRequestStatus.PROCESSING, failureReason: null },
      });
      if (claimed.count !== 1) return null;
      const attemptNumber = await tx.invoiceRequestAttempt.count({ where: { invoiceRequestId: requestId } }) + 1;
      const attempt = await tx.invoiceRequestAttempt.create({ data: {
        invoiceRequestId: requestId, attemptNumber, adapterKey,
        status: InvoiceRequestAttemptStatus.PROCESSING,
      } });
      await tx.auditEvent.create({ data: {
        accountId: request.workspace.accountId, actorUserId: request.requestedByUserId,
        action: INVOICE_AUDIT_ACTIONS.STARTED, entityType: 'InvoiceRequest', entityId: requestId,
        metadata: { attemptId: attempt.id, attemptNumber, adapterKey, retry: true },
      } });
      return { request: { ...request, status: InvoiceRequestStatus.PROCESSING }, attempt };
    });
  }

  async markAcceptedPending(
    workspaceId: string, requestId: string, attemptId: string,
    policy: PendingDocumentPolicy = { windowMs: 72 * 60 * 60 * 1000, initialBackoffMs: 30 * 60 * 1000, maxBackoffMs: 12 * 60 * 60 * 1000, maxChecks: 12 },
    externalReference?: string,
    delivery?: { strategy: 'PORTAL_POLL' | 'EMAIL_DELIVERY'; email?: string; rfc?: string; amount?: string },
  ) {
    const request = await this.scopedRequest(workspaceId, requestId);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.invoiceRequestAttempt.update({ where: { id: attemptId }, data: {
        status: InvoiceRequestAttemptStatus.COMPLETED, finishedAt: new Date(),
      } });
      const updated = await tx.invoiceRequest.update({ where: { id: requestId }, data: {
        status: InvoiceRequestStatus.ACCEPTED_PENDING, failureReason: null,
        pendingSince: now, acceptedAt: now,
        nextCheckAt: delivery?.strategy === 'EMAIL_DELIVERY' ? null : new Date(now.getTime() + policy.initialBackoffMs),
        documentsDeadline: new Date(now.getTime() + policy.windowMs), maxPendingChecks: policy.maxChecks,
        ...(delivery ? {
          deliveryStrategy: delivery.strategy,
          deliveryEmail: delivery.email,
          billingRfcSnapshot: delivery.rfc,
          requestedAmountSnapshot: delivery.amount,
        } : {}),
        ...(externalReference ? { externalReference } : {}),
      } });
      await tx.auditEvent.create({ data: {
        accountId: request.workspace.accountId, actorUserId: request.requestedByUserId,
        action: 'INVOICE_REQUEST_ACCEPTED_PENDING', entityType: 'InvoiceRequest', entityId: requestId,
        metadata: { attemptId },
      } });
      return updated;
    });
  }

  async reschedulePending(workspaceId: string, requestId: string, policy: PendingDocumentPolicy, now: Date) {
    const request = await this.scopedRequest(workspaceId, requestId);
    if (request.status !== InvoiceRequestStatus.ACCEPTED_PENDING) return request;
    const nextCount = request.pendingCheckCount + 1;
    if (nextCount >= request.maxPendingChecks) return this.markDocumentsTimeout(workspaceId, requestId);
    const delay = Math.min(policy.initialBackoffMs * 2 ** nextCount, policy.maxBackoffMs);
    return this.prisma.invoiceRequest.update({
      where: { id: requestId }, data: { pendingCheckCount: nextCount, nextCheckAt: new Date(now.getTime() + delay) },
    });
  }

  async markDocumentsTimeout(workspaceId: string, requestId: string) {
    const request = await this.scopedRequest(workspaceId, requestId);
    if (request.status !== InvoiceRequestStatus.ACCEPTED_PENDING) return request;
    return this.prisma.invoiceRequest.update({
      where: { id: requestId },
      data: { status: InvoiceRequestStatus.DOCUMENTS_TIMEOUT, nextCheckAt: null, failureReason: 'DOCUMENTS_TIMEOUT' },
    });
  }

  async markInvoiceWindowExpired(
    workspaceId: string,
    requestId: string,
    attemptId: string | undefined,
    evidence: { ticketDate: Date | string; evaluatedAt: Date; elapsedDays: number | null; limitDays: number | null },
  ) {
    const request = await this.scopedRequest(workspaceId, requestId);
    return this.prisma.$transaction(async (tx) => {
      if (attemptId) await tx.invoiceRequestAttempt.update({ where: { id: attemptId }, data: {
        status: InvoiceRequestAttemptStatus.FAILED, finishedAt: evidence.evaluatedAt,
        errorCode: 'INVOICE_WINDOW_EXPIRED', errorMessage: 'Invoice window expired',
      } });
      const updated = await tx.invoiceRequest.update({ where: { id: requestId }, data: {
        status: InvoiceRequestStatus.INVOICE_WINDOW_EXPIRED, failureReason: 'INVOICE_WINDOW_EXPIRED',
      } });
      await tx.auditEvent.create({ data: {
        accountId: request.workspace.accountId, actorUserId: request.requestedByUserId,
        action: INVOICE_AUDIT_ACTIONS.WINDOW_EXPIRED, entityType: 'InvoiceRequest', entityId: requestId,
        metadata: {
          ticketDate: new Date(evidence.ticketDate).toISOString(),
          evaluatedAt: evidence.evaluatedAt.toISOString(), elapsedDays: evidence.elapsedDays,
          limitDays: evidence.limitDays, ...(attemptId ? { attemptId } : {}),
        },
      } });
      return updated;
    });
  }

  async completeWithPersistedDocuments(workspaceId: string, requestId: string, attemptId: string, documentIds: string[]) {
    const request = await this.scopedRequest(workspaceId, requestId);
    if (request.status !== InvoiceRequestStatus.ACCEPTED_PENDING && request.status !== InvoiceRequestStatus.PROCESSING) return request;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoiceRequest.update({ where: { id: requestId }, data: {
        status: InvoiceRequestStatus.COMPLETED, completedAt: new Date(), nextCheckAt: null, failureReason: null,
      } });
      await tx.auditEvent.create({ data: {
        accountId: request.workspace.accountId, actorUserId: request.requestedByUserId,
        action: INVOICE_AUDIT_ACTIONS.COMPLETED, entityType: 'InvoiceRequest', entityId: requestId,
        metadata: { attemptId, documentIds },
      } });
      return updated;
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

function normalizeEvidenceText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Z0-9]/giu, '').toUpperCase();
}
