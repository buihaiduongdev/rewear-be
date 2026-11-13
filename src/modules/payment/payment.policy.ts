export type AttemptState =
  | 'CREATING'
  | 'PENDING'
  | 'UNKNOWN'
  | 'FAILED'
  | 'PAID'
  | 'REFUND_REQUIRED'
  | 'REFUNDED';

// Fail closed for undocumented, ambiguous, maintenance and authorization results.
export function providerOutcome(code: number): 'PAID' | 'FAILED' | 'UNKNOWN' {
  if (code === 0) return 'PAID';
  if (
    [
      98, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1017, 1026, 4001, 4002,
      4100,
    ].includes(code)
  )
    return 'FAILED';
  return 'UNKNOWN';
}

export function canStartAttempt(states: AttemptState[]): boolean {
  return (
    states.length < 3 &&
    states.every((state) =>
      ['FAILED', 'REFUND_REQUIRED', 'REFUNDED'].includes(state),
    )
  );
}

export function captureDisposition(input: {
  amount: number;
  expectedAmount: number;
  resultCode: number;
  checkoutState: string;
  expiresAt: number;
  now: number;
  alreadyPaid: boolean;
  ownsAllProducts: boolean;
}): 'SETTLE' | 'REFUND' | 'FAILED' | 'UNKNOWN' {
  const outcome = providerOutcome(input.resultCode);
  if (outcome !== 'PAID') return outcome;
  return input.amount === input.expectedAmount &&
    input.checkoutState === 'HELD' &&
    input.now < input.expiresAt &&
    !input.alreadyPaid &&
    input.ownsAllProducts
    ? 'SETTLE'
    : 'REFUND';
}

export function firstReconciliationAt(
  createdAt: number,
  expiresAt: number,
): number {
  return Math.max(createdAt, Math.min(createdAt + 60000, expiresAt - 120000));
}
