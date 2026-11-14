import {
  ORDER_CANCEL_STATE,
  ORDER_CANCELLATION_REASON,
  ORDER_EVENT_ACTION,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from './order.constants';

export const orderStates = Object.values(ORDER_STATUS);
export const orderEventActions = Object.values(ORDER_EVENT_ACTION);
export type OrderState = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
export type OrderEventAction =
  (typeof ORDER_EVENT_ACTION)[keyof typeof ORDER_EVENT_ACTION];
export type OrderCancellationReason =
  (typeof ORDER_CANCELLATION_REASON)[keyof typeof ORDER_CANCELLATION_REASON];
export type OrderCancelState =
  (typeof ORDER_CANCEL_STATE)[keyof typeof ORDER_CANCEL_STATE];
export type OrderPaymentMethod =
  (typeof ORDER_PAYMENT_METHOD)[keyof typeof ORDER_PAYMENT_METHOD];
export type OrderListInput = {
  status?: OrderState;
  limit?: number;
  offset?: number;
};
