export interface InvoiceAdapterDocument {
  readonly fileName: string;
  readonly content: Uint8Array;
}

export interface InvoicePortalContext {
  readonly invoiceRequestId: string;
  readonly merchantKey: string;
  readonly taxProfileId: string;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly values: Readonly<Record<string, unknown>>;
}

export interface InvoicePortalResult {
  readonly success: boolean;
  readonly xmlDocument?: InvoiceAdapterDocument;
  readonly pdfDocument?: InvoiceAdapterDocument;
  readonly externalReference?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

export interface InvoicePortalAdapter {
  readonly key: string;
  canHandle(merchantKey: string): boolean;
  validateInput(context: InvoicePortalContext): Promise<readonly string[]>;
  execute(context: InvoicePortalContext): Promise<InvoicePortalResult>;
  getRequiredFields(merchantKey: string): readonly string[];
  normalizeResult(result: unknown): InvoicePortalResult;
}
