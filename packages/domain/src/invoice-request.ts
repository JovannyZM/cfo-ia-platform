export const INVOICE_REQUEST_TRANSITIONS = {
  PENDING: ['NEEDS_TAX_DATA', 'READY', 'CANCELLED'],
  NEEDS_TAX_DATA: ['READY', 'CANCELLED'],
  READY: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: ['READY', 'PROCESSING', 'CANCELLED'],
  CANCELLED: [],
} as const;

export type InvoiceRequestStatus = keyof typeof INVOICE_REQUEST_TRANSITIONS;

export function canTransitionInvoiceRequest(from: InvoiceRequestStatus, to: InvoiceRequestStatus): boolean {
  return (INVOICE_REQUEST_TRANSITIONS[from] as readonly string[]).includes(to);
}
