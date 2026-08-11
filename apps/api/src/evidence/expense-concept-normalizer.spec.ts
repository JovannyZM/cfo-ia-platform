import {
  EXPENSE_EVIDENCE_INTERPRETATION_FAILED,
  EXPENSE_EVIDENCE_INTERPRETED,
  EXPENSE_EVIDENCE_RECEIVED,
} from '@cfo-ia/domain';
import { describe, expect, it } from 'vitest';
import { WorkerRegistry } from '../workers/worker-registry';
import { FakeExpenseEvidenceInterpreter } from './fake-expense-evidence-interpreter';
import { ExpenseInterpreterWorker } from './expense-interpreter.worker';
import { usefulExpenseDescription } from './expense-concept-normalizer';

describe('usefulExpenseDescription', () => {
  it('replaces a Costco item count with a useful concept', () => {
    expect(usefulExpenseDescription('Costco Wholesale', '3 artículos', 'INSUMOS'))
      .toBe('Compra de supermercado');
  });

  it('keeps a useful description and handles known merchant categories', () => {
    expect(usefulExpenseDescription('Costco Wholesale', 'Compra de oficina', null))
      .toBe('Compra de oficina');
    expect(usefulExpenseDescription('Walmart', '5 productos', null))
      .toBe('Compra de supermercado');
    expect(usefulExpenseDescription('Gasolinera Pemex', null, null)).toBe('Gasolina');
  });
});

describe('ExpenseInterpreterWorker ticket fields', () => {
  it('emits debit card metadata and never substitutes an authorization for last4', async () => {
    const fake = new FakeExpenseEvidenceInterpreter();
    fake.result = {
      ...fake.result,
      merchantName: 'Costco Wholesale',
      description: '3 artículos',
      paymentMethod: 'DEBIT_CARD',
      paymentInstrumentType: 'CARD',
      paymentLast4: null,
      documentNumber: '0330',
      warnings: ['La autorización 825371 no es el número de tarjeta.'],
    };
    const worker = new ExpenseInterpreterWorker(fake, new WorkerRegistry());
    const [result] = await worker.execute({
      eventId: '10000000-0000-4000-8000-000000000001',
      type: EXPENSE_EVIDENCE_RECEIVED,
      workspaceId: '10000000-0000-4000-8000-000000000002',
      createdAt: new Date(),
      payload: { image: Uint8Array.from([1]), mimeType: 'image/jpeg' },
    });
    expect(result?.type).toBe(EXPENSE_EVIDENCE_INTERPRETED);
    expect(result?.payload).toMatchObject({
      merchantName: 'Costco Wholesale',
      description: 'Compra de supermercado',
      paymentMethod: 'DEBIT_CARD',
      paymentInstrumentType: 'CARD',
    });
    expect(result?.payload).not.toHaveProperty('paymentLast4');
  });

  it('rejects a document that contains no recognizable expense evidence', async () => {
    const fake = new FakeExpenseEvidenceInterpreter();
    fake.result = {
      merchantName: null, description: null, occurredAt: null, originalAmount: null,
      merchantRfc: null,
      originalCurrency: null, category: null, paymentMethod: null,
      paymentInstrumentType: null, paymentLast4: null, spenderName: null,
      documentNumber: null, confidence: 0.2, warnings: [],
    };
    const worker = new ExpenseInterpreterWorker(fake, new WorkerRegistry());
    const [result] = await worker.execute({
      eventId: '10000000-0000-4000-8000-000000000001',
      type: EXPENSE_EVIDENCE_RECEIVED,
      workspaceId: '10000000-0000-4000-8000-000000000002',
      createdAt: new Date(),
      payload: { image: Uint8Array.from([1]), mimeType: 'application/pdf', extractedText: 'Contrato sin gasto' },
    });
    expect(result?.type).toBe(EXPENSE_EVIDENCE_INTERPRETATION_FAILED);
    expect(result?.payload).toMatchObject({
      code: 'INVALID_EXPENSE_EVIDENCE', reason: 'No detecté un comprobante de gasto válido.',
    });
  });

  it('preserves the printed local CFDI emission time for downstream persistence', async () => {
    const fake = new FakeExpenseEvidenceInterpreter();
    fake.result = {
      ...fake.result,
      merchantName: 'CYBERPUERTA',
      merchantRfc: 'CYB080602JSA',
      occurredAt: '2026-07-30T13:16:55',
      originalAmount: '23858.00',
      paymentMethod: 'TRANSFER',
      description: 'Laptop Lenovo ThinkPad L14 Gen 6 y costo de envío',
      category: 'Equipo de cómputo',
      documentNumber: 'ABFA 239061801',
    };
    const worker = new ExpenseInterpreterWorker(fake, new WorkerRegistry());
    const [result] = await worker.execute({
      eventId: '10000000-0000-4000-8000-000000000001',
      type: EXPENSE_EVIDENCE_RECEIVED,
      workspaceId: '10000000-0000-4000-8000-000000000002',
      createdAt: new Date(),
      payload: {
        image: Uint8Array.from([1]), mimeType: 'application/pdf',
        extractedText: 'CFDI con texto seleccionable',
      },
    });
    expect(result?.payload).toMatchObject({
      merchantName: 'CYBERPUERTA',
      occurredAt: '2026-07-30T13:16:55.000Z',
      originalAmount: '23858.00',
      paymentMethod: 'TRANSFER',
    });
  });
});
