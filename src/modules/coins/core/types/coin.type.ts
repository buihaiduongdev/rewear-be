import type {
  COIN_RELEASE_CAUSE,
  COIN_RESERVATION_STATE,
  COIN_SOURCE,
} from '../constants/coin.constant';

export type CoinSource = (typeof COIN_SOURCE)[keyof typeof COIN_SOURCE];
export type CoinReservationState =
  (typeof COIN_RESERVATION_STATE)[keyof typeof COIN_RESERVATION_STATE];
export type CoinAllocation = {
  grantId: string;
  rootGrantId: string;
  amount: number;
};
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
export type CoinReleaseCause =
  (typeof COIN_RELEASE_CAUSE)[keyof typeof COIN_RELEASE_CAUSE];

export type AllocatableLot = {
  id: string;
  amount: number;
  held: number;
  spent: number;
  recovered: number;
  transferred?: number;
  expiresAt: Date | null;
  createdAt: Date;
};
