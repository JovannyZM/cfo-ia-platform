import type { DomainEvent } from '@cfo-ia/domain';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from './in-memory-event-bus';

const event: DomainEvent = {
  eventId: 'event-1',
  type: 'ExpenseReceived',
  workspaceId: 'workspace-1',
  payload: { source: 'test' },
  createdAt: new Date('2026-07-29T12:00:00.000Z'),
};

describe('InMemoryEventBus', () => {
  it('publishes an event to its subscribers', async () => {
    const eventBus = new InMemoryEventBus();
    const handler = vi.fn();
    eventBus.subscribe(event.type, handler);

    await eventBus.publish(event);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('stops delivering events after a subscription is cancelled', async () => {
    const eventBus = new InMemoryEventBus();
    const handler = vi.fn();
    const unsubscribe = eventBus.subscribe(event.type, handler);

    unsubscribe();
    await eventBus.publish(event);

    expect(handler).not.toHaveBeenCalled();
  });
});
