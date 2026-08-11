import type { Worker } from '@cfo-ia/domain';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { WorkerRegistry } from './worker-registry';

function createWorker(id: string, listensTo: readonly string[]): Worker {
  return {
    id,
    name: `Worker ${id}`,
    description: 'Test worker',
    version: '1.0.0',
    listensTo,
    emits: [],
    canHandle: vi.fn(() => true),
    execute: vi.fn(() => Promise.resolve([])),
  };
}

describe('WorkerRegistry', () => {
  it('registers a Worker and preserves registration order', () => {
    const registry = new WorkerRegistry();
    const firstWorker = createWorker('first', ['ExpenseReceived']);
    const secondWorker = createWorker('second', ['ExpenseReceived']);

    registry.register(firstWorker);
    registry.register(secondWorker);

    expect(registry.getAll()).toEqual([firstWorker, secondWorker]);
  });

  it('rejects duplicate Worker ids', () => {
    const registry = new WorkerRegistry();
    registry.register(createWorker('duplicate-id', ['FirstEvent']));

    expect(() =>
      registry.register(createWorker('duplicate-id', ['SecondEvent'])),
    ).toThrow(ConflictException);
  });

  it('finds Workers by event type in registration order', () => {
    const registry = new WorkerRegistry();
    const firstMatch = createWorker('first-match', ['ExpenseReceived']);
    const unrelated = createWorker('unrelated', ['InvoiceRequested']);
    const secondMatch = createWorker('second-match', ['ExpenseReceived', 'OtherEvent']);

    registry.register(firstMatch);
    registry.register(unrelated);
    registry.register(secondMatch);

    expect(registry.findByEvent('ExpenseReceived')).toEqual([firstMatch, secondMatch]);
    expect(registry.findByEvent('UnknownEvent')).toEqual([]);
  });
});
