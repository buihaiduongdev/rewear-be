import { GHN_SHIPMENT_STATUS } from '@/infrastructure/shipping/constants/ghn-shipment.constant';
import {
  ORDER_CANCEL_STATE,
  ORDER_STATUS,
} from '@/modules/order/constants/order.constant';
import type { Order } from '@/modules/order/entities';
import type { OrderState } from '@/modules/order/schemas/order.schema';
import {
  SHIPMENT_STATE,
  UNSAFE_CARRIER_REVIEW_REASONS,
} from '@/modules/shipment/constants/shipment.constant';
import type { Shipment } from '@/modules/shipment/entities/shipment.entity';

const deliveredOrderStates: readonly OrderState[] = [
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.DISPUTE,
  ORDER_STATUS.COMPLETED,
];

function hasUnresolvedCancellation(order: Order, now: Date): boolean {
  const wasCancellationRejected =
    order.cancelState === ORDER_CANCEL_STATE.REJECTED;
  if (!wasCancellationRejected) return Boolean(order.cancelState);

  const reviewWindowMissing = !order.cancelReviewUntil;
  const reviewWindowOpen = Boolean(
    order.cancelReviewUntil && order.cancelReviewUntil > now,
  );
  return reviewWindowMissing || reviewWindowOpen;
}

export function requiresFulfillmentReview(
  order: Order,
  shipment: Shipment,
  now: Date,
): boolean {
  const isOrderDelivered =
    deliveredOrderStates.includes(order.status) &&
    Boolean(order.deliveryObservedAt);
  const isCarrierDeliveryConfirmed =
    shipment.providerStatus === GHN_SHIPMENT_STATUS.DELIVERED;
  const isDeliveryVerified = isOrderDelivered && isCarrierDeliveryConfirmed;

  const isShipmentCancelled = shipment.state === SHIPMENT_STATE.CANCELLED;
  const hasReturnInProgress = Boolean(
    shipment.returnRequestedAt || order.carrierReturnedAt,
  );
  const isCancellationUnresolved = hasUnresolvedCancellation(order, now);
  const hasHandoverReview = order.handoverReviewRequired;
  const hasUnsafeCarrierData = Boolean(
    shipment.reviewReason &&
    UNSAFE_CARRIER_REVIEW_REASONS.includes(shipment.reviewReason),
  );

  const requiresReview =
    !isDeliveryVerified ||
    isShipmentCancelled ||
    hasReturnInProgress ||
    isCancellationUnresolved ||
    hasHandoverReview ||
    hasUnsafeCarrierData;
  return requiresReview;
}
