import { EXPENSE_REGISTERED, type DomainEvent, type ExpenseRegisteredPayload, type Worker } from '@cfo-ia/domain';
import { Injectable } from '@nestjs/common';
import { InvoiceRequestStatus, TaxProfileStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  PortalAdapterRegistry,
  type AutomatedInvoicePortalAdapter,
  type AutomatedInvoicePortalContext,
} from '../portal-automation/portal-adapter.registry';
import { PortalFlowService } from '../portal-automation/portal-flow.service';
import { WorkerRegistry } from '../workers/worker-registry';
import { InvoiceRequestsService } from './invoice-requests.service';

@Injectable()
export class InvoiceAutomationWorker implements Worker {
  readonly id = 'invoice-automation';
  readonly name = 'Auxiliar de Facturación';
  readonly description = 'Inicia solicitudes de factura elegibles mediante el PAE';
  readonly version = '0.1.0';
  readonly listensTo = [EXPENSE_REGISTERED] as const;
  readonly emits = [] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly requests: InvoiceRequestsService,
    private readonly adapters: PortalAdapterRegistry,
    private readonly portalFlows: PortalFlowService,
    registry: WorkerRegistry,
  ) {
    registry.register(this);
  }

  canHandle(event: DomainEvent): boolean {
    return event.type === EXPENSE_REGISTERED;
  }

  async execute(event: DomainEvent): Promise<readonly DomainEvent[]> {
    const payload = event.payload as ExpenseRegisteredPayload;
    if ((!payload.documentNumber && !payload.documentIdentifiers?.length) || !payload.requestedByUserId) return [];

    const profiles = await this.prisma.merchantInvoiceProfile.findMany({ where: { active: true } });
    const merchant = uniqueMerchantMatch(payload.merchantName, profiles);
    if (!merchant) return [];
    const adapter = this.adapters.findByMerchantKey(merchant.merchantKey);
    if (!adapter) return [];

    const taxProfiles = await this.prisma.taxProfile.findMany({
      where: {
        workspaceId: event.workspaceId,
        status: TaxProfileStatus.ACTIVE,
        approvedAt: { not: null },
        postalCode: { not: null },
        taxRegime: { not: null },
        cfdiUse: { not: null },
        billingEmail: { not: null },
        deletedAt: null,
      },
      take: 2,
    });
    if (taxProfiles.length !== 1) return [];
    const taxProfile = taxProfiles[0]!;
    const portalContext: AutomatedInvoicePortalContext = {
      documentNumber: payload.documentNumber ?? '',
      ...(payload.documentIdentifiers ? { documentIdentifiers: payload.documentIdentifiers } : {}),
      totalAmount: payload.originalAmount,
      taxProfile,
    };
    const resolvedDocumentNumber = adapter.resolveDocumentNumber(portalContext);
    if (!resolvedDocumentNumber) return [];
    const validatedContext = { ...portalContext, documentNumber: resolvedDocumentNumber };
    adapter.validatePreflight(validatedContext);

    const request = await this.requests.create({
      workspaceId: event.workspaceId,
      expenseId: payload.expenseId,
      merchantName: payload.merchantName,
      merchantKey: merchant.merchantKey,
      channel: payload.sourceChannel ?? 'INTERNAL',
      taxProfileId: taxProfile.id,
      requestedByUserId: payload.requestedByUserId,
      documentNumber: resolvedDocumentNumber,
    });
    if (request.status !== InvoiceRequestStatus.READY) return [];

    const started = await this.requests.tryStart(event.workspaceId, request.id, adapter.adapterKey);
    if (!started) return [];
    await this.runStartedRequest(event.workspaceId, request.id, started.attempt.id, adapter, validatedContext);
    return [];
  }

  async retry(invoiceRequestId: string): Promise<'STARTED' | 'NOT_RETRYABLE'> {
    const request = await this.prisma.invoiceRequest.findUnique({
      where: { id: invoiceRequestId },
      include: { expense: true, taxProfile: true },
    });
    if (!request?.expense || !request.taxProfile || request.status !== InvoiceRequestStatus.FAILED) {
      return 'NOT_RETRYABLE';
    }
    const adapter = this.adapters.findByMerchantKey(request.merchantKey);
    if (!adapter) return 'NOT_RETRYABLE';
    const identifiers = parseDocumentIdentifiers(request.expense.documentIdentifiers);
    const legacyNumber = request.documentNumber ??
      await this.findOriginalDocumentNumber(request.workspaceId, request.expense);
    if (!legacyNumber) throw new Error('INVOICE_RETRY_DOCUMENT_NUMBER_UNAVAILABLE');
    const portalContext: AutomatedInvoicePortalContext = {
      documentNumber: legacyNumber,
      ...(identifiers.length ? { documentIdentifiers: identifiers } : {}),
      totalAmount: request.expense.originalAmount.toString(),
      taxProfile: request.taxProfile,
    };
    const documentNumber = adapter.resolveDocumentNumber(portalContext);
    if (!documentNumber) throw new Error('INVOICE_RETRY_DOCUMENT_NUMBER_INVALID');
    const validatedContext = { ...portalContext, documentNumber };
    adapter.validatePreflight(validatedContext);
    const started = await this.requests.tryRetryStart(request.workspaceId, request.id, adapter.adapterKey);
    if (!started) return 'NOT_RETRYABLE';
    await this.runStartedRequest(request.workspaceId, request.id, started.attempt.id, adapter, validatedContext);
    return 'STARTED';
  }

  private async findOriginalDocumentNumber(
    workspaceId: string,
    expense: { sourceEventId: string; sourceChannel: string | null; sourceConversationId: string | null },
  ): Promise<string | undefined> {
    const sessions = await this.prisma.conversationSession.findMany({
      where: {
        workspaceId,
        ...(expense.sourceChannel ? { sourceChannel: expense.sourceChannel } : {}),
        ...(expense.sourceConversationId ? { sourceConversationId: expense.sourceConversationId } : {}),
        workerId: 'expense-assistant',
      },
      orderBy: { updatedAt: 'desc' },
    });
    for (const session of sessions) {
      const context = session.contextJson as { sourceEventId?: unknown; draft?: { documentNumber?: unknown } };
      if (context.sourceEventId !== expense.sourceEventId) continue;
      const value = context.draft?.documentNumber;
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
  }

  private async runStartedRequest(
    workspaceId: string,
    requestId: string,
    attemptId: string,
    adapter: AutomatedInvoicePortalAdapter,
    context: AutomatedInvoicePortalContext,
  ): Promise<void> {
    try {
      const input = adapter.buildInvoiceFlowInput(context);
      const result = await this.portalFlows.execute(
        workspaceId,
        'INVOICE_REQUEST_AUTOMATION',
        adapter,
        input,
        attemptId,
      );
      if (result.outcome === 'ACCEPTED_PENDING') {
        await this.requests.markAcceptedPending(workspaceId, requestId, attemptId);
      } else if (result.outcome === 'REJECTED' || result.outcome === 'UNKNOWN_OUTCOME') {
        await this.requests.fail(
          workspaceId,
          requestId,
          attemptId,
          `PORTAL_${result.outcome}`,
          `Portal flow finished as ${result.outcome}`,
        );
      }
    } catch (error) {
      await this.requests.fail(
        workspaceId,
        requestId,
        attemptId,
        'PORTAL_FLOW_FAILED',
        error instanceof Error ? error.message : 'Portal flow failed',
      );
    }
  }
}

function parseDocumentIdentifiers(value: unknown): NonNullable<AutomatedInvoicePortalContext['documentIdentifiers']> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.type !== 'string' || typeof record.value !== 'string') return [];
    return [{ type: record.type, value: record.value } as NonNullable<AutomatedInvoicePortalContext['documentIdentifiers']>[number]];
  });
}

type MerchantProfile = { merchantKey: string; displayName: string };

function uniqueMerchantMatch(merchantName: string, profiles: readonly MerchantProfile[]): MerchantProfile | undefined {
  const normalizedMerchant = normalize(merchantName);
  const matches = profiles.filter((profile) => {
    const displayName = normalize(profile.displayName);
    const merchantKey = normalize(profile.merchantKey);
    return normalizedMerchant.includes(displayName) || normalizedMerchant.includes(merchantKey);
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toUpperCase();
}
