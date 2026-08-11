import type { DomainEvent, EventBus, Unsubscribe } from '@cfo-ia/domain';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { EXPENSE_TEXT_RECEIVED, type ExpenseTextReceivedPayload } from '@cfo-ia/domain';
import { EVENT_BUS } from '../workers/workers.module';
import { WorkerRegistry } from '../workers/worker-registry';
import { ConversationSessionService } from '../conversations/conversation-session.service';

@Injectable()
export class BrainService implements OnModuleInit, OnModuleDestroy {
  private readonly unsubscribeCallbacks: Unsubscribe[] = [];

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly workerRegistry: WorkerRegistry,
    @Optional() private readonly conversationSessions?: ConversationSessionService,
  ) {}

  onModuleInit(): void {
    const eventTypes = new Set(
      this.workerRegistry.getAll().flatMap((worker) => worker.listensTo),
    );

    for (const eventType of eventTypes) {
      this.unsubscribeCallbacks.push(
        this.eventBus.subscribe(eventType, (event) => this.handle(event)),
      );
    }
  }

  onModuleDestroy(): void {
    for (const unsubscribe of this.unsubscribeCallbacks.splice(0)) {
      unsubscribe();
    }
  }

  async handle(event: DomainEvent): Promise<void> {
    if (event.type === EXPENSE_TEXT_RECEIVED && this.conversationSessions) {
      const payload = event.payload as ExpenseTextReceivedPayload;
      if (payload.sourceChannel && payload.sourceConversationId && payload.userId) {
        const active = await this.conversationSessions.getActive({
          workspaceId: event.workspaceId,
          sourceChannel: payload.sourceChannel,
          sourceConversationId: payload.sourceConversationId,
          userId: payload.userId,
        });
        if (active) return;
      }
    }
    const workers = this.workerRegistry.findByEvent(event.type);

    for (const worker of workers) {
      if (!worker.canHandle(event)) continue;

      const resultingEvents = await worker.execute(event);

      for (const resultingEvent of resultingEvents) {
        await this.eventBus.publish({
          eventId: resultingEvent.eventId,
          type: resultingEvent.type,
          workspaceId: event.workspaceId,
          payload: resultingEvent.payload,
          createdAt: resultingEvent.createdAt,
          ...(event.correlationId === undefined
            ? {}
            : { correlationId: event.correlationId }),
          causationId: event.eventId,
        });
      }
    }
  }
}
