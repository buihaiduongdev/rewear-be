import { createActor, setup } from 'xstate';

import { ORDER_STATUS } from '@/modules/order/constants';

export type OrderFulfillmentStatus =
  (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export type OrderFulfillmentEvent =
  | { type: 'PAYMENT_RECEIVED' }
  | { type: 'SELLER_ACCEPT' }
  | { type: 'SELLER_REJECT'; reason?: string }
  | { type: 'BUYER_CANCEL'; reason?: string }
  | { type: 'TIMEOUT_EXPIRED' }
  | { type: 'DISPATCH_SHIPPING' }
  | { type: 'DELIVERY_SUCCESS' }
  | { type: 'BUYER_CONFIRM' }
  | { type: 'SETTLEMENT_DUE' }
  | { type: 'RAISE_DISPUTE'; reason?: string }
  | { type: 'RESOLVE_DISMISS' }
  | { type: 'RESOLVE_RETURN' }
  | { type: 'RETURN_INSPECTED' };

export interface OrderFulfillmentContext {
  status: OrderFulfillmentStatus;
  sellerConfirmBy?: Date | null;
  handoverBy?: Date | null;
  disputeDeadlineAt?: Date | null;
}

/**
 * XState State Machine quản lý toàn bộ vòng đời thực thi Đơn hàng (Order Fulfillment).
 * Kiểm soát luồng thanh toán, duyệt đơn của shop, bàn giao vận chuyển,
 * đếm ngược 72h khiếu nại và tự động giải ngân hoàn tất đơn.
 */
export const orderFulfillmentMachine = setup({
  types: {
    input: {} as Partial<OrderFulfillmentContext>,
    context: {} as OrderFulfillmentContext,
    events: {} as OrderFulfillmentEvent,
  },
  guards: {
    isWithinConfirmDeadline: ({ context }) => {
      if (!context.sellerConfirmBy) return true;
      return context.sellerConfirmBy.getTime() > Date.now();
    },
    isWithinHandoverDeadline: ({ context }) => {
      if (!context.handoverBy) return true;
      return context.handoverBy.getTime() > Date.now();
    },
    isDisputeDeadlinePassed: ({ context }) => {
      if (!context.disputeDeadlineAt) return false;
      return context.disputeDeadlineAt.getTime() <= Date.now();
    },
  },
}).createMachine({
  id: 'orderFulfillment',
  context: ({ input }) => ({
    status: input?.status ?? ORDER_STATUS.PENDING,
    sellerConfirmBy: input?.sellerConfirmBy,
    handoverBy: input?.handoverBy,
    disputeDeadlineAt: input?.disputeDeadlineAt,
  }),
  initial: ORDER_STATUS.PENDING,
  states: {
    [ORDER_STATUS.WAITING]: {
      on: {
        PAYMENT_RECEIVED: ORDER_STATUS.PENDING,
        TIMEOUT_EXPIRED: ORDER_STATUS.CANCELLED,
      },
    },
    [ORDER_STATUS.PENDING]: {
      on: {
        SELLER_ACCEPT: {
          target: ORDER_STATUS.PREPARING,
          guard: 'isWithinConfirmDeadline',
        },
        SELLER_REJECT: ORDER_STATUS.CANCELLED,
        BUYER_CANCEL: ORDER_STATUS.CANCELLED,
        TIMEOUT_EXPIRED: ORDER_STATUS.CANCELLED,
      },
    },
    [ORDER_STATUS.PREPARING]: {
      on: {
        DISPATCH_SHIPPING: ORDER_STATUS.SHIPPING,
        TIMEOUT_EXPIRED: ORDER_STATUS.CANCELLED,
      },
    },
    [ORDER_STATUS.SHIPPING]: {
      on: {
        DELIVERY_SUCCESS: ORDER_STATUS.DELIVERED,
      },
    },
    [ORDER_STATUS.DELIVERED]: {
      on: {
        BUYER_CONFIRM: ORDER_STATUS.COMPLETED,
        SETTLEMENT_DUE: {
          target: ORDER_STATUS.COMPLETED,
          guard: 'isDisputeDeadlinePassed',
        },
        RAISE_DISPUTE: ORDER_STATUS.DISPUTE,
      },
    },
    [ORDER_STATUS.DISPUTE]: {
      on: {
        RESOLVE_DISMISS: ORDER_STATUS.COMPLETED,
        RESOLVE_RETURN: ORDER_STATUS.RETURNS,
      },
    },
    [ORDER_STATUS.RETURNS]: {
      on: {
        RETURN_INSPECTED: ORDER_STATUS.CANCELLED,
      },
    },
    [ORDER_STATUS.COMPLETED]: {
      type: 'final',
    },
    [ORDER_STATUS.CANCELLED]: {
      type: 'final',
    },
  },
});

/**
 * Kiểm tra xem đơn hàng có thể chuyển trạng thái theo sự kiện hay không.
 */
export function canTransitionOrderStatus(
  currentStatus: OrderFulfillmentStatus,
  event: OrderFulfillmentEvent,
  context: Partial<OrderFulfillmentContext> = {},
): boolean {
  return getNextOrderStatus(currentStatus, event, context) !== null;
}

/**
 * Tính toán trạng thái tiếp theo của đơn hàng thông qua máy trạng thái XState.
 */
export function getNextOrderStatus(
  currentStatus: OrderFulfillmentStatus,
  event: OrderFulfillmentEvent,
  context: Partial<OrderFulfillmentContext> = {},
): OrderFulfillmentStatus | null {
  const machineContext: OrderFulfillmentContext = {
    status: currentStatus,
    ...context,
  };

  const actor = createActor(orderFulfillmentMachine, {
    snapshot: orderFulfillmentMachine.resolveState({
      value: currentStatus,
      context: machineContext,
    }),
    input: machineContext,
  });
  actor.start();
  actor.send(event);
  const nextState = actor.getSnapshot().value as OrderFulfillmentStatus;
  actor.stop();

  return nextState !== currentStatus ? nextState : null;
}
