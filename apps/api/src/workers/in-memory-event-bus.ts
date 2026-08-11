import type {
  DomainEvent,
  DomainEventHandler,
  EventBus,
  Unsubscribe,
} from '@cfo-ia/domain';
import { Injectable } from '@nestjs/common';

@Injectable()
export class InMemoryEventBus implements EventBus {
  private readonly subscriptions = new Map<string, DomainEventHandler[]>();

  async publish(event: DomainEvent): Promise<void> {
    const handlers = [...(this.subscriptions.get(event.type) ?? [])];

    for (const handler of handlers) {
      await handler(event);
    }
  }

  subscribe(eventType: string, handler: DomainEventHandler): Unsubscribe {
    const handlers = this.subscriptions.get(eventType) ?? [];
    handlers.push(handler);
    this.subscriptions.set(eventType, handlers);

    return () => {
      const currentHandlers = this.subscriptions.get(eventType);
      if (!currentHandlers) return;

      const remainingHandlers = currentHandlers.filter(
        (registeredHandler) => registeredHandler !== handler,
      );

      if (remainingHandlers.length === 0) {
        this.subscriptions.delete(eventType);
        return;
      }

      this.subscriptions.set(eventType, remainingHandlers);
    };
  }
}
