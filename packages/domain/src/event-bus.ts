import type { DomainEvent } from './domain-event';

export type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

export type Unsubscribe = () => void;

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe(eventType: string, handler: DomainEventHandler): Unsubscribe;
}
