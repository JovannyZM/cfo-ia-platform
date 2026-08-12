import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceRequestStatus } from '@prisma/client';
import type { CapturedPortalDocument } from '../portal-automation/browser-provider';
import { PortalAdapterRegistry, type PendingDocumentPolicy } from '../portal-automation/portal-adapter.registry';
import { PrismaService } from '../prisma.service';
import { InvoiceDownloadManagerService } from './invoice-download-manager.service';
import { InvoiceRequestsService } from './invoice-requests.service';

export type PendingDocumentResult = { documents: readonly CapturedPortalDocument[]; externalReference?: string };
export type PendingDocumentResolver = (invoiceRequestId: string) => Promise<PendingDocumentResult>;

@Injectable()
export class PendingInvoiceDocumentsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private readonly resolvers = new Map<string, PendingDocumentResolver>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapters: PortalAdapterRegistry,
    private readonly downloads: InvoiceDownloadManagerService,
    private readonly requests: InvoiceRequestsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const interval = positiveNumber(this.config.get<string>('INVOICE_PENDING_POLL_INTERVAL_MS'), 900_000);
    this.timer = setInterval(() => void this.runDue(), interval);
    this.timer.unref();
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  registerResolver(adapterKey: string, resolver: PendingDocumentResolver): void {
    this.resolvers.set(adapterKey, resolver);
  }

  async schedule(workspaceId: string, requestId: string, attemptId: string, adapterKey: string, externalReference?: string) {
    const policy = this.adapters.findByAdapterKey(adapterKey)?.getPendingDocumentPolicy?.() ?? defaultPolicy();
    return this.requests.markAcceptedPending(workspaceId, requestId, attemptId, policy, externalReference);
  }

  async runDue(now = new Date()): Promise<number> {
    const due = await this.prisma.invoiceRequest.findMany({
      where: { status: InvoiceRequestStatus.ACCEPTED_PENDING, nextCheckAt: { lte: now } },
      take: 25,
    });
    for (const request of due) await this.checkOne(request.id, now);
    return due.length;
  }

  async checkOne(requestId: string, now = new Date()): Promise<'COMPLETED' | 'PENDING' | 'TIMEOUT'> {
    const request = await this.prisma.invoiceRequest.findUnique({
      where: { id: requestId }, include: { attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } },
    });
    if (!request || request.status !== InvoiceRequestStatus.ACCEPTED_PENDING) return 'PENDING';
    if (request.documentsDeadline && request.documentsDeadline <= now) {
      await this.requests.markDocumentsTimeout(request.workspaceId, request.id);
      return 'TIMEOUT';
    }
    const attempt = request.attempts[0];
    if (!attempt) return 'PENDING';
    const result = await (this.resolvers.get(attempt.adapterKey)?.(request.id) ?? Promise.resolve({ documents: [] }));
    if (result.documents.length > 0) {
      const persisted = await this.downloads.persist({
        workspaceId: request.workspaceId, invoiceRequestId: request.id, attemptId: attempt.id, documents: result.documents,
      });
      await this.requests.completeWithPersistedDocuments(request.workspaceId, request.id, attempt.id, persisted.map(({ id }) => id));
      return 'COMPLETED';
    }
    const policy = this.adapters.findByAdapterKey(attempt.adapterKey)?.getPendingDocumentPolicy?.() ?? defaultPolicy();
    await this.requests.reschedulePending(request.workspaceId, request.id, policy, now);
    return 'PENDING';
  }
}

function defaultPolicy(): PendingDocumentPolicy {
  return { windowMs: 72 * 60 * 60 * 1000, initialBackoffMs: 30 * 60 * 1000, maxBackoffMs: 12 * 60 * 60 * 1000, maxChecks: 12 };
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
