export const orderStates = [
  'waiting',
  'pending',
  'preparing',
  'shipping',
  'delivered',
  'completed',
  'dispute',
  'returns',
  'cancelled',
] as const;
export type OrderState = (typeof orderStates)[number];
export const orderEventActions = [
  'PAID',
  'PLACED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'BUYER_CANCELLED',
  'CANCEL_APPROVED',
  'SHIPPING',
  'DELIVERED',
  'RETURNING',
  'CANCEL_REQUESTED',
  'CANCEL_DECISION',
  'CANCEL_REVIEW_REQUESTED',
  'CANCEL_REVIEW_DECIDED',
] as const;
export type OrderEventAction = (typeof orderEventActions)[number];
export type OrderListInput = {
  status?: OrderState;
  limit?: number;
  offset?: number;
};
