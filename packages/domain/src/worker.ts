import type { DomainEvent } from './domain-event';

export interface Worker {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly listensTo: readonly string[];
  readonly emits: readonly string[];

  canHandle(event: DomainEvent): boolean;
  execute(event: DomainEvent): Promise<readonly DomainEvent[]>;
}
