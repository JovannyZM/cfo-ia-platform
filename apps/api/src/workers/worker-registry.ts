import type { Worker } from '@cfo-ia/domain';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class WorkerRegistry {
  private readonly workers: Worker[] = [];

  register(worker: Worker): void {
    if (this.workers.some((registeredWorker) => registeredWorker.id === worker.id)) {
      throw new ConflictException(`Worker with id "${worker.id}" is already registered`);
    }

    this.workers.push(worker);
  }

  getAll(): readonly Worker[] {
    return [...this.workers];
  }

  findByEvent(eventType: string): readonly Worker[] {
    return this.workers.filter((worker) => worker.listensTo.includes(eventType));
  }
}
