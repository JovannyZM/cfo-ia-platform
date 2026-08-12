export const INVOICE_REQUEST_TRANSITIONS = {
  PENDING: ['NEEDS_DOCUMENT_DATA', 'NEEDS_TAX_DATA', 'READY', 'CANCELLED'],
  NEEDS_DOCUMENT_DATA: ['READY', 'CANCELLED'],
  NEEDS_TAX_DATA: ['READY', 'CANCELLED'],
  READY: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['ACCEPTED_PENDING', 'COMPLETED', 'ALREADY_INVOICED', 'FAILED'],
  ACCEPTED_PENDING: ['PROCESSING', 'COMPLETED', 'DOCUMENTS_TIMEOUT', 'CANCELLED'],
  COMPLETED: [],
  ALREADY_INVOICED: [],
  DOCUMENTS_TIMEOUT: [],
  FAILED: ['READY', 'PROCESSING', 'CANCELLED'],
  CANCELLED: [],
} as const;

export type InvoiceRequestStatus = keyof typeof INVOICE_REQUEST_TRANSITIONS;

export function canTransitionInvoiceRequest(from: InvoiceRequestStatus, to: InvoiceRequestStatus): boolean {
  return (INVOICE_REQUEST_TRANSITIONS[from] as readonly string[]).includes(to);
}
