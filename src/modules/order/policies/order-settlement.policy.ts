import { ORDER_POLICY } from '../constants/order.constant';
import type { Order } from '../entities';
import type { OrderDeliveryVerification } from '../entities/order-delivery-verification.entity';

export function isSettlementWindowDue(
  order: Pick<Order, 'deliveryVerifiedAt' | 'disputeDeadlineAt'>,
  verification: Pick<
    OrderDeliveryVerification,
    'deliveredAt' | 'disputeDeadlineAt'
  > | null,
  now: Date,
): boolean {
  if (!verification) return false;
  const deliveryMatches =
    order.deliveryVerifiedAt?.getTime() === verification.deliveredAt.getTime();
  const deadlineMatches =
    order.disputeDeadlineAt?.getTime() ===
    verification.disputeDeadlineAt.getTime();
  const hasFullWindow =
    verification.disputeDeadlineAt.getTime() ===
    verification.deliveredAt.getTime() + ORDER_POLICY.DISPUTE_WINDOW_MS;
  const deadlineReached = verification.disputeDeadlineAt <= now;
  return deliveryMatches && deadlineMatches && hasFullWindow && deadlineReached;
}
