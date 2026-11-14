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
export type OrderListInput = {
  status?: OrderState;
  limit?: number;
  offset?: number;
};
