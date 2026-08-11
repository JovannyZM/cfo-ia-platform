import type { DomainEvent, Worker } from '@cfo-ia/domain';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from '../workers/in-memory-event-bus';
import { WorkerRegistry } from '../workers/worker-registry';
import { BrainService } from './brain.service';

const incomingEvent: DomainEvent = {
  eventId: 'incoming-event',
  type: 'ArbitraryIncomingEvent',
  workspaceId: 'workspace-1',
  payload: { source: 'test' },
  createdAt: new Date('2026-07-29T12:00:00.000Z'),
  correlationId: 'correlation-1',
};

function createResultEvent(eventId: string, type = 'ArbitraryResultEvent'): DomainEvent {
  return {
    eventId,
    type,
    workspaceId: 'worker-must-not-control-workspace',
    payload: { result: eventId },
    createdAt: new Date('2026-07-29T12:01:00.000Z'),
    correlationId: 'worker-must-not-control-correlation',
    causationId: 'worker-must-not-control-causation',
  };
}

function createWorker(
  id: string,
  execute: Worker['execute'],
  listensTo: readonly string[] = [incomingEvent.type],
): Worker {
  return {
    id,
    name: `Worker ${id}`,
    description: 'Test worker',
    version: '1.0.0',
    listensTo,
    emits: ['ArbitraryResultEvent'],
    canHandle: vi.fn(() => true),
    execute,
  };
}

function createSubject() {
  const eventBus = new InMemoryEventBus();
  const registry = new WorkerRegistry();
  const brain = new BrainService(eventBus, registry);
  return { brain, eventBus, registry };
}

describe('BrainService', () => {
  it('executes multiple Workers sequentially in registration order', async () => {
    const { brain, registry } = createSubject();
    const executionOrder: string[] = [];

    registry.register(
      createWorker('first', async () => {
        executionOrder.push('first:start');
        await Promise.resolve();
        executionOrder.push('first:end');
        return [];
      }),
    );
    registry.register(
      createWorker('second', () => {
        executionOrder.push('second:start');
        executionOrder.push('second:end');
        return Promise.resolve([]);
      }),
    );

    await brain.handle(incomingEvent);

    expect(executionOrder).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ]);
  });

  it('publishes the events returned by a Worker', async () => {
    const { brain, eventBus, registry } = createSubject();
    const receivedEvents: DomainEvent[] = [];
    const resultEvent = createResultEvent('result-1');
    eventBus.subscribe(resultEvent.type, (event) => {
      receivedEvents.push(event);
    });
    registry.register(
      createWorker('publisher', vi.fn(() => Promise.resolve([resultEvent]))),
    );

    await brain.handle(incomingEvent);

    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]).toMatchObject({
      eventId: resultEvent.eventId,
      type: resultEvent.type,
      payload: resultEvent.payload,
    });
  });

  it('propagates workspace and correlation and assigns direct causation', async () => {
    const { brain, eventBus, registry } = createSubject();
    const receivedEvents: DomainEvent[] = [];
    const resultEvent = createResultEvent('traceable-result');
    eventBus.subscribe(resultEvent.type, (event) => {
      receivedEvents.push(event);
    });
    registry.register(
      createWorker('traceable', vi.fn(() => Promise.resolve([resultEvent]))),
    );

    await brain.handle(incomingEvent);

    expect(receivedEvents[0]).toMatchObject({
      workspaceId: incomingEvent.workspaceId,
      correlationId: incomingEvent.correlationId,
      causationId: incomingEvent.eventId,
    });
  });

  it('stops execution, propagates the error and publishes nothing from a failing Worker', async () => {
    const { brain, eventBus, registry } = createSubject();
    const receivedEvents: DomainEvent[] = [];
    const laterExecute = vi.fn(() => Promise.resolve<readonly DomainEvent[]>([]));
    const laterWorker = createWorker('later', laterExecute);
    eventBus.subscribe('ResultFromFailingWorker', (event) => {
      receivedEvents.push(event);
    });
    registry.register(
      createWorker('failing', vi.fn(() => Promise.reject(new Error('worker failed')))),
    );
    registry.register(laterWorker);

    await expect(brain.handle(incomingEvent)).rejects.toThrow('worker failed');
    expect(receivedEvents).toEqual([]);
    expect(laterExecute).not.toHaveBeenCalled();
  });

  it('uses canHandle without encoding rules for particular Workers', async () => {
    const { brain, registry } = createSubject();
    const skippedExecute = vi.fn(() => Promise.resolve<readonly DomainEvent[]>([]));
    const skippedCanHandle = vi.fn(() => false);
    const skippedWorker = createWorker('skipped', skippedExecute);
    skippedWorker.canHandle = skippedCanHandle;
    registry.register(skippedWorker);

    await brain.handle(incomingEvent);

    expect(skippedCanHandle).toHaveBeenCalledWith(incomingEvent);
    expect(skippedExecute).not.toHaveBeenCalled();
  });

  it('contains no switch or Worker-specific routing rules', async () => {
    const { brain, registry } = createSubject();
    const arbitraryExecute = vi.fn(() => Promise.resolve<readonly DomainEvent[]>([]));
    const arbitraryWorker = createWorker('completely-arbitrary-id', arbitraryExecute);
    registry.register(arbitraryWorker);

    await brain.handle(incomingEvent);

    expect(arbitraryExecute).toHaveBeenCalledWith(incomingEvent);
    expect(BrainService.prototype.handle.toString()).not.toMatch(/\bswitch\b/);
  });

  it('subscribes only to event types declared by registered Workers and unsubscribes on destroy', async () => {
    const { brain, eventBus, registry } = createSubject();
    const workerExecute = vi.fn(() => Promise.resolve<readonly DomainEvent[]>([]));
    const worker = createWorker('subscriber', workerExecute);
    registry.register(worker);
    brain.onModuleInit();

    await eventBus.publish(incomingEvent);
    expect(workerExecute).toHaveBeenCalledOnce();

    brain.onModuleDestroy();
    await eventBus.publish(incomingEvent);
    expect(workerExecute).toHaveBeenCalledOnce();
  });
});
