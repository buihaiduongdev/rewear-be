import { CHECKOUT_STATUS } from '../../checkout/constants/checkout.constant';
import {
  PAYMENT_ATTEMPT_STATE,
  PAYMENT_CAPTURE_DISPOSITION,
  PAYMENT_EXPIRY_RECONCILIATION_WINDOW_MS,
  PAYMENT_MAX_ATTEMPTS,
  PAYMENT_PROVIDER_FAILURE_STATUSES,
  PAYMENT_PROVIDER_OUTCOME,
  PAYMENT_RECONCILIATION_DELAY_MS,
  PAYOS_STATUS,
} from '../constants/payment.constant';
import type {
  AttemptState,
  CaptureDisposition,
  ProviderOutcome,
} from '../schemas/payment.schema';

export type { AttemptState } from '../schemas/payment.schema';

// Fail closed for undocumented, pending, processing, or underpaid provider states.
export function providerOutcome(status: string): ProviderOutcome {
  if (status === PAYOS_STATUS.PAID) return PAYMENT_PROVIDER_OUTCOME.PAID;
  if (PAYMENT_PROVIDER_FAILURE_STATUSES.includes(status))
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
  status: string;
  checkoutState: string;
  expiresAt: number;
  now: number;
  alreadyPaid: boolean;
  ownsAllProducts: boolean;
}): CaptureDisposition {
  const outcome = providerOutcome(input.status);
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
