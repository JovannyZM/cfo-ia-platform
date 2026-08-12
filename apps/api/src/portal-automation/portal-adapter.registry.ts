import { Injectable } from '@nestjs/common';
import type { StagedPortalAdapter } from './portal-stage-flow';

export type AutomatedInvoicePortalContext = {
  documentNumber: string;
  documentIdentifiers?: readonly {
    type: 'TICKET_NUMBER' | 'ORDER_NUMBER' | 'BARCODE' | 'TRANSACTION_NUMBER' | 'AUTHORIZATION_NUMBER' | 'REFERENCE_NUMBER' | 'STORE_NUMBER' | 'REGISTER_NUMBER' | 'OTHER';
    value: string;
  }[];
  totalAmount: string;
  occurredAt: Date | string;
  taxProfile: {
    status: string;
    approvedAt: Date | string | null;
    rfc: string;
    legalName: string;
    postalCode: string | null;
    taxRegime: string | null;
    cfdiUse: string | null;
    billingEmail: string | null;
  };
};

export type PendingDocumentPolicy = {
  strategy?: 'PORTAL_POLL' | 'EMAIL_DELIVERY';
  windowMs: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  maxChecks: number;
  expectedDocumentTypes?: readonly ('XML' | 'PDF')[];
};

export interface AutomatedInvoicePortalAdapter extends StagedPortalAdapter<string> {
  readonly merchantKeys: readonly string[];
  buildInvoiceFlowInput(context: AutomatedInvoicePortalContext): Readonly<Record<string, string>>;
  resolveDocumentNumber(context: AutomatedInvoicePortalContext): string | undefined;
  validatePreflight(context: AutomatedInvoicePortalContext): void;
  getPendingDocumentPolicy?(): PendingDocumentPolicy;
}

@Injectable()
export class PortalAdapterRegistry {
  private readonly adapters = new Map<string, AutomatedInvoicePortalAdapter>();

  register(adapter: AutomatedInvoicePortalAdapter): void {
    for (const merchantKey of adapter.merchantKeys) {
      const normalized = merchantKey.trim().toUpperCase();
      if (this.adapters.has(normalized)) throw new Error(`Portal adapter already registered for ${normalized}`);
      this.adapters.set(normalized, adapter);
    }
  }

  findByMerchantKey(merchantKey: string): AutomatedInvoicePortalAdapter | undefined {
    return this.adapters.get(merchantKey.trim().toUpperCase());
  }

  findByAdapterKey(adapterKey: string): AutomatedInvoicePortalAdapter | undefined {
    return [...new Set(this.adapters.values())].find((adapter) => adapter.adapterKey === adapterKey);
  }
}
