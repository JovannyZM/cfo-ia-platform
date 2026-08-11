import { Injectable } from '@nestjs/common';
import type { StagedPortalAdapter } from './portal-stage-flow';

export type AutomatedInvoicePortalContext = {
  documentNumber: string;
  totalAmount: string;
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

export interface AutomatedInvoicePortalAdapter extends StagedPortalAdapter<string> {
  readonly merchantKeys: readonly string[];
  buildInvoiceFlowInput(context: AutomatedInvoicePortalContext): Readonly<Record<string, string>>;
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
}
