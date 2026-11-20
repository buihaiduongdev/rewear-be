import { FEE_PAYMENT_STATE } from './constants/fee-payment.constant';
import type { FeePaymentState, FeeTarget } from './types/fee-payment.type';

export function hasOverlappingFeeAttempt(
  attempts: { state: FeePaymentState; targets: Pick<FeeTarget, 'feeId'>[] }[],
  feeIds: string[],
) {
  const selected = new Set(feeIds);
  return attempts.some(
    (attempt) =>
      (
        [
          FEE_PAYMENT_STATE.CREATING,
          FEE_PAYMENT_STATE.PENDING,
          FEE_PAYMENT_STATE.UNKNOWN,
        ] as readonly FeePaymentState[]
      ).includes(attempt.state) &&
      attempt.targets.some((target) => selected.has(target.feeId)),
  );
}
export function allocateFeeCapture(
  expected: number,
  captured: number,
  outstanding: number[],
) {
  let remaining = captured === expected ? captured : 0;
  const allocations = outstanding.map((amount) => {
    const allocated = Math.min(Math.max(0, amount), remaining);
    remaining -= allocated;
    return allocated;
  });
  return {
    allocations,
    refund: captured - allocations.reduce((sum, amount) => sum + amount, 0),
  };
}
export function feeRefundPublicView(refund: {
  id: string;
  amount: number;
  state: string;
  alertedAt: Date | null;
  responseDueAt: Date | null;
}) {
  return {
    id: refund.id,
    amount: refund.amount,
    state: refund.state,
    alertedAt: refund.alertedAt,
    responseDueAt: refund.responseDueAt,
  };
}
