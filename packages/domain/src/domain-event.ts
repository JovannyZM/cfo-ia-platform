export interface DomainEvent<TPayload = unknown> {
  readonly eventId: string;
  readonly type: string;
  readonly workspaceId: string;
  readonly payload: TPayload;
  readonly createdAt: Date;
  readonly correlationId?: string;
  readonly causationId?: string;
}
