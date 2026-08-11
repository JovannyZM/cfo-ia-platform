import { EXPENSE_REGISTERED, type DomainEvent, type ExpenseRegisteredPayload, type Worker } from '@cfo-ia/domain';
import { Injectable } from '@nestjs/common';
import { InvoiceRequestStatus, TaxProfileStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { PortalAdapterRegistry } from '../portal-automation/portal-adapter.registry';
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
    if (!payload.documentNumber || !payload.requestedByUserId) return [];

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

    const request = await this.requests.create({
      workspaceId: event.workspaceId,
      expenseId: payload.expenseId,
      merchantName: payload.merchantName,
      merchantKey: merchant.merchantKey,
      channel: payload.sourceChannel ?? 'INTERNAL',
      taxProfileId: taxProfile.id,
      requestedByUserId: payload.requestedByUserId,
    });
    if (request.status !== InvoiceRequestStatus.READY) return [];

    const started = await this.requests.tryStart(event.workspaceId, request.id, adapter.adapterKey);
    if (!started) return [];
    try {
      const input = adapter.buildInvoiceFlowInput({
        documentNumber: payload.documentNumber,
        totalAmount: payload.originalAmount,
        taxProfile,
      });
      const result = await this.portalFlows.execute(
        event.workspaceId,
        'INVOICE_REQUEST_AUTOMATION',
        adapter,
        input,
      );
      if (result.outcome === 'ACCEPTED_PENDING') {
        await this.requests.markAcceptedPending(event.workspaceId, request.id, started.attempt.id);
      } else if (result.outcome === 'REJECTED' || result.outcome === 'UNKNOWN_OUTCOME') {
        await this.requests.fail(
          event.workspaceId,
          request.id,
          started.attempt.id,
          `PORTAL_${result.outcome}`,
          `Portal flow finished as ${result.outcome}`,
        );
      }
    } catch (error) {
      await this.requests.fail(
        event.workspaceId,
        request.id,
        started.attempt.id,
        'PORTAL_FLOW_FAILED',
        error instanceof Error ? error.message : 'Portal flow failed',
      );
    }
    return [];
  }
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
