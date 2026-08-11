import {
  EXPENSE_EVIDENCE_INTERPRETATION_FAILED,
  EXPENSE_EVIDENCE_INTERPRETED,
  EXPENSE_EVIDENCE_RECEIVED,
  type DomainEvent,
  type ExpenseEvidenceInterpretedPayload,
  type ExpenseEvidenceInterpretationFailedPayload,
  type ExpenseEvidenceReceivedPayload,
  type Worker,
} from '@cfo-ia/domain';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { WorkerRegistry } from '../workers/worker-registry';
import {
  EXPENSE_EVIDENCE_INTERPRETER,
  expenseInterpretationResultSchema,
  type ExpenseEvidenceInterpreter,
  type ExpenseInterpretationResult,
} from './expense-evidence-interpreter';
import { usefulExpenseDescription } from './expense-concept-normalizer';

@Injectable()
export class ExpenseInterpreterWorker implements Worker {
  readonly id = 'expense-interpreter';
  readonly name = 'Intérprete de Gastos IA';
  readonly description = 'Convierte imágenes de tickets en datos estructurados';
  readonly version = '2.0.0';
  readonly listensTo = [EXPENSE_EVIDENCE_RECEIVED] as const;
  readonly emits = [
    EXPENSE_EVIDENCE_INTERPRETED,
    EXPENSE_EVIDENCE_INTERPRETATION_FAILED,
  ] as const;

  constructor(
    @Inject(EXPENSE_EVIDENCE_INTERPRETER)
    private readonly interpreter: ExpenseEvidenceInterpreter,
    registry: WorkerRegistry,
  ) {
    registry.register(this);
  }

  canHandle(event: DomainEvent): boolean {
    return event.type === EXPENSE_EVIDENCE_RECEIVED;
  }

  async execute(event: DomainEvent): Promise<readonly DomainEvent[]> {
    const payload = this.readPayload(event.payload);

    try {
      const interpretation = expenseInterpretationResultSchema.parse(
        await this.interpreter.interpret({
          image: payload.image,
          mimeType: payload.mimeType,
          ...(payload.extractedText ? { extractedText: payload.extractedText } : {}),
        }),
      );
      return [this.toResultEvent(event, interpretation, payload)];
    } catch (error: unknown) {
      return [this.toFailureEvent(event, this.errorCode(error))];
    }
  }

  private toResultEvent(
    event: DomainEvent,
    result: ExpenseInterpretationResult,
    source: ExpenseEvidenceReceivedPayload,
  ): DomainEvent {
    if (!result.merchantName && !result.originalAmount && !result.occurredAt) {
      return this.toFailureEvent(
        event,
        'INVALID_EXPENSE_EVIDENCE',
        result.confidence,
        [],
        result.warnings,
      );
    }
    const required = [
      'merchantName',
      'occurredAt',
      'originalAmount',
      'originalCurrency',
    ] as const;
    const missingFields = required.filter((field) => !result[field]);

    if (missingFields.length > 0 || result.confidence < 0.8) {
      return this.toFailureEvent(
        event,
        'NEEDS_REVIEW',
        result.confidence,
        missingFields,
        result.warnings,
      );
    }

    const payload: ExpenseEvidenceInterpretedPayload = {
      merchantName: result.merchantName!,
      description: usefulExpenseDescription(
        result.merchantName!,
        result.description,
        result.category,
      ),
      occurredAt: source.extractedText &&
        !/(?:Z|[+-]\d{2}:\d{2})$/u.test(result.occurredAt!)
        ? `${result.occurredAt!}.000Z`
        : result.occurredAt!,
      originalAmount: result.originalAmount!,
      originalCurrency: result.originalCurrency!,
      ...(result.category ? { category: result.category } : {}),
      ...(result.paymentMethod ? { paymentMethod: result.paymentMethod } : {}),
      ...(result.paymentInstrumentType
        ? { paymentInstrumentType: result.paymentInstrumentType }
        : {}),
      ...(result.paymentLast4 ? { paymentLast4: result.paymentLast4 } : {}),
      ...(result.spenderName ? { spenderName: result.spenderName } : {}),
      ...(source.sourceChannel ? { sourceChannel: source.sourceChannel } : {}),
      ...(source.sourceConversationId ? { sourceConversationId: source.sourceConversationId } : {}),
      ...(source.evidenceSha256 ? { evidenceSha256: source.evidenceSha256 } : {}),
    };

    return {
      eventId: randomUUID(),
      type: EXPENSE_EVIDENCE_INTERPRETED,
      workspaceId: event.workspaceId,
      payload,
      createdAt: new Date(),
    };
  }

  private toFailureEvent(
    event: DomainEvent,
    code: string,
    confidence = 0,
    missingFields: readonly string[] = [],
    warnings: readonly string[] = [],
  ): DomainEvent<ExpenseEvidenceInterpretationFailedPayload> {
    const reason =
      code === 'INVALID_EXPENSE_EVIDENCE'
        ? 'No detecté un comprobante de gasto válido.'
        : code === 'NEEDS_REVIEW'
        ? 'La imagen requiere revisión'
        : 'No fue posible interpretar la imagen';

    return {
      eventId: randomUUID(),
      type: EXPENSE_EVIDENCE_INTERPRETATION_FAILED,
      workspaceId: event.workspaceId,
      payload: { code, reason, confidence, missingFields, warnings },
      createdAt: new Date(),
    };
  }

  private readPayload(payload: unknown): ExpenseEvidenceReceivedPayload {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('image' in payload) ||
      !(payload.image instanceof Uint8Array) ||
      !('mimeType' in payload) ||
      typeof payload.mimeType !== 'string'
    ) {
      throw new Error('Invalid ExpenseEvidenceReceived payload');
    }

    return {
      image: payload.image,
      mimeType: payload.mimeType,
      ...('sourceChannel' in payload && typeof payload.sourceChannel === 'string'
        ? { sourceChannel: payload.sourceChannel }
        : {}),
      ...('sourceConversationId' in payload && typeof payload.sourceConversationId === 'string'
        ? { sourceConversationId: payload.sourceConversationId }
        : {}),
      ...('evidenceSha256' in payload && typeof payload.evidenceSha256 === 'string'
        ? { evidenceSha256: payload.evidenceSha256 }
        : {}),
      ...('extractedText' in payload && typeof payload.extractedText === 'string'
        ? { extractedText: payload.extractedText }
        : {}),
    };
  }

  private errorCode(error: unknown): string {
    if (error instanceof Error && /timeout/i.test(error.name + error.message)) {
      return 'INTERPRETER_TIMEOUT';
    }
    if (
      error instanceof Error &&
      /Zod|INVALID_INTERPRETER_RESPONSE/i.test(error.name + error.message)
    ) {
      return 'INVALID_INTERPRETER_RESPONSE';
    }
    return 'INTERPRETER_ERROR';
  }
}
