export type { DomainEvent } from './domain-event';
export type { DomainEventHandler, EventBus, Unsubscribe } from './event-bus';
export type { Worker } from './worker';
export {
  EXPENSE_EVIDENCE_INTERPRETED,
  EXPENSE_EVIDENCE_RECEIVED,
  EXPENSE_EVIDENCE_INTERPRETATION_FAILED,
  EXPENSE_REGISTERED,
  EXPENSE_INFORMATION_REQUIRED,
  EXPENSE_TEXT_RECEIVED,
} from './expense-events';
export type {
  ExpenseEvidenceInterpretedPayload,
  ExpenseEvidenceReceivedPayload,
  ExpenseEvidenceInterpretationFailedPayload,
  ExpenseRegisteredPayload,
  ExpenseInformationRequiredPayload,
  ExpenseTextReceivedPayload,
} from './expense-events';

export const PLATFORM_ADMIN_ROLE = 'PLATFORM_ADMIN' as const;

export const ACCOUNT_ROLES = ['ACCOUNT_OWNER', 'ACCOUNT_ADMIN', 'MEMBER', 'VIEWER'] as const;

export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const TAX_PROFILE_REQUEST_TRANSITIONS = {
  SUBMITTED: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['AWAITING_PAYMENT', 'APPROVED', 'REJECTED', 'CANCELLED'],
  AWAITING_PAYMENT: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
} as const;

export type TaxProfileRequestStatus = keyof typeof TAX_PROFILE_REQUEST_TRANSITIONS;

export function canTransitionTaxProfileRequest(
  from: TaxProfileRequestStatus,
  to: TaxProfileRequestStatus,
): boolean {
  return (TAX_PROFILE_REQUEST_TRANSITIONS[from] as readonly string[]).includes(to);
}

export function normalizeRfc(rfc: string): string {
  return rfc.trim().toUpperCase();
}
export type {
  InvoiceAdapterDocument,
  InvoicePortalAdapter,
  InvoicePortalContext,
  InvoicePortalResult,
} from './invoice-portal-adapter';
export { INVOICE_REQUEST_TRANSITIONS, canTransitionInvoiceRequest } from './invoice-request';
export type { InvoiceRequestStatus as DomainInvoiceRequestStatus } from './invoice-request';
