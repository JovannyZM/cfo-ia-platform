import type {
  ExpenseEvidenceInterpreter,
  ExpenseEvidenceInterpreterInput,
  ExpenseInterpretationResult,
} from './expense-evidence-interpreter';

export class FakeExpenseEvidenceInterpreter implements ExpenseEvidenceInterpreter {
  result: ExpenseInterpretationResult = {
    merchantName: 'Costco',
    merchantRfc: null,
    description: 'Compra de insumos',
    occurredAt: '2026-07-29T18:00:00.000Z',
    originalAmount: '1250.50',
    originalCurrency: 'MXN',
    category: 'INSUMOS',
    paymentMethod: 'DEBIT_CARD',
    paymentInstrumentType: 'CARD',
    paymentLast4: '1234',
    spenderName: 'Test User',
    documentNumber: null,
    confidence: 0.95,
    warnings: [],
  };
  error: Error | undefined;
  onInterpret:
    | ((input: ExpenseEvidenceInterpreterInput) => void | Promise<void>)
    | undefined;

  interpret(input: ExpenseEvidenceInterpreterInput): Promise<ExpenseInterpretationResult> {
    void input;
    if (this.error) return Promise.reject(this.error);
    return Promise.resolve(this.onInterpret?.(input)).then(() => this.result);
  }
}
