import { CHECKOUT_STATUS } from '../checkout/checkout.constants';
import {
  PAYMENT_ATTEMPT_STATE,
  PAYMENT_CAPTURE_DISPOSITION,
  PAYMENT_EXPIRY_RECONCILIATION_WINDOW_MS,
  PAYMENT_MAX_ATTEMPTS,
  PAYMENT_PROVIDER_FAILURE_CODES,
  PAYMENT_PROVIDER_OUTCOME,
  PAYMENT_PROVIDER_SUCCESS_CODE,
  PAYMENT_RECONCILIATION_DELAY_MS,
} from './payment.constants';
import type {
  AttemptState,
  CaptureDisposition,
  ProviderOutcome,
} from './payment.type';

export type { AttemptState } from './payment.type';

// Fail closed for undocumented, ambiguous, maintenance and authorization results.
export function providerOutcome(code: number): ProviderOutcome {
  if (code === PAYMENT_PROVIDER_SUCCESS_CODE)
    return PAYMENT_PROVIDER_OUTCOME.PAID;
  if (PAYMENT_PROVIDER_FAILURE_CODES.includes(code))
    return PAYMENT_PROVIDER_OUTCOME.FAILED;
  return PAYMENT_PROVIDER_OUTCOME.UNKNOWN;
}

export function canStartAttempt(states: AttemptState[]): boolean {
  return (
    states.length < PAYMENT_MAX_ATTEMPTS &&
    states.every((state) =>
      (
        [
          PAYMENT_ATTEMPT_STATE.FAILED,
          PAYMENT_ATTEMPT_STATE.REFUND_REQUIRED,
          PAYMENT_ATTEMPT_STATE.REFUNDED,
        ] as readonly string[]
      ).includes(state),
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
}): CaptureDisposition {
  const outcome = providerOutcome(input.resultCode);
  if (outcome !== PAYMENT_PROVIDER_OUTCOME.PAID) return outcome;
  return input.amount === input.expectedAmount &&
    input.checkoutState === CHECKOUT_STATUS.HELD &&
    input.now < input.expiresAt &&
    !input.alreadyPaid &&
    input.ownsAllProducts
    ? PAYMENT_CAPTURE_DISPOSITION.SETTLE
    : PAYMENT_CAPTURE_DISPOSITION.REFUND;
}

export function firstReconciliationAt(
  createdAt: number,
  expiresAt: number,
): number {
  return Math.max(
    createdAt,
    Math.min(
      createdAt + PAYMENT_RECONCILIATION_DELAY_MS,
      expiresAt - PAYMENT_EXPIRY_RECONCILIATION_WINDOW_MS,
    ),
  );
}
