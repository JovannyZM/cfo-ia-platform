export interface ExpenseAnomalyInput {
  readonly concept: string;
  readonly amount: string;
  readonly currency: string;
}

const MVP_GASOLINE_CONFIRMATION_THRESHOLD_MXN = 10_000;

export function requiresExpenseAmountConfirmation(
  input: ExpenseAnomalyInput,
): boolean {
  return (
    input.currency === 'MXN' &&
    /gasolina/i.test(input.concept) &&
    Number(input.amount) > MVP_GASOLINE_CONFIRMATION_THRESHOLD_MXN
  );
}
