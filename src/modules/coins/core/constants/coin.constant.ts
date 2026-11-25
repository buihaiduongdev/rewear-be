import { MAX_VND_AMOUNT } from '@/common/constants/money.constant';

export const COIN_MODES = ['EVIDENCE', 'SIMULATION'] as const;

export const COIN_RESERVATION_STATE = {
  HELD: 'HELD',
  COD: 'COD',
  CONSUMED: 'CONSUMED',
  RELEASED: 'RELEASED',
} as const;

export const COIN_POLICY = {
  MAX_POSTGRES_AMOUNT: MAX_VND_AMOUNT,
  SUBTOTAL_LIMIT_DIVISOR: 10,
  PURCHASE_REWARD_DIVISOR: 200,
} as const;
