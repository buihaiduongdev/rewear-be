import z from 'zod';

import { dateTimeSchema } from '@/common/schemas/date-time.schema';

import { COIN_MODES, COIN_RESERVATION_STATE } from '../constants/coin.constant';

export const coinHistoryQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

export const coinBalanceViewSchema = z.object({
  balance: z.number().int().nonnegative(),
  heldBalance: z.number().int().nonnegative(),
  simulationBalance: z.number().int().nonnegative(),
  simulationHeldBalance: z.number().int().nonnegative(),
});

export const coinHistoryViewSchema = z.object({
  rewards: z.array(
    z.object({
      id: z.uuid(),
      orderId: z.uuid(),
      mode: z.enum(COIN_MODES),
      grantedAmount: z.number().int().nonnegative(),
      entitlement: z.number().int().nonnegative(),
      recoveredAmount: z.number().int().nonnegative(),
      evaluatedAt: dateTimeSchema,
      createdAt: dateTimeSchema,
    }),
  ),
  debits: z.array(
    z.object({
      id: z.uuid(),
      orderId: z.uuid(),
      mode: z.enum(COIN_MODES),
      amount: z.number().int().positive(),
      createdAt: dateTimeSchema,
    }),
  ),
});

export type CoinHistoryQueryInput = z.infer<typeof coinHistoryQuerySchema>;
export type CoinBalanceView = z.input<typeof coinBalanceViewSchema>;
export type CoinHistoryView = z.input<typeof coinHistoryViewSchema>;
export type CoinReservationState =
  (typeof COIN_RESERVATION_STATE)[keyof typeof COIN_RESERVATION_STATE];

export type CoinCheckout = {
  id: string;
  buyerId: string;
  expiresAt: Date | null;
  subtotal?: number;
};

export type CoinOrder = {
  id: string;
  buyerId: string;
  coinDiscount?: number;
  coinMode?: 'EVIDENCE' | 'SIMULATION' | null;
  subtotal?: number;
};
