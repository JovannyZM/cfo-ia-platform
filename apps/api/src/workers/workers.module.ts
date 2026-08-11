import { Module } from '@nestjs/common';
import { InMemoryEventBus } from './in-memory-event-bus';
import { WorkerRegistry } from './worker-registry';

export const EVENT_BUS = Symbol('EVENT_BUS');

@Module({
  providers: [
    InMemoryEventBus,
    WorkerRegistry,
    { provide: EVENT_BUS, useExisting: InMemoryEventBus },
  ],
  exports: [EVENT_BUS, WorkerRegistry],
})
export class WorkersModule {}
