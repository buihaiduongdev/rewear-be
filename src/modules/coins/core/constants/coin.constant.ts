import ms from 'ms';

import { MAX_VND_AMOUNT } from '@/common/constants/money.constant';

export const COIN_SOURCE = {
  PURCHASE: 'PURCHASE',
  PROGRAM: 'PROGRAM',
  RESTORATION: 'RESTORATION',
} as const;
export const COIN_RESERVATION_STATE = {
  HELD: 'HELD',
  COD: 'COD',
  CONSUMED: 'CONSUMED',
  RELEASED: 'RELEASED',
  PENDING_CAUSE: 'PENDING_CAUSE',
} as const;
export const COIN_RELEASE_CAUSE = {
  SELLER: 'SELLER',
  CARRIER: 'CARRIER',
  INCONCLUSIVE: 'INCONCLUSIVE',
  BUYER_CHANGE: 'BUYER_CHANGE',
  BUYER: 'BUYER',
  UNKNOWN: 'UNKNOWN',
} as const;
export const COIN_POLICY = {
  MAX_POSTGRES_AMOUNT: MAX_VND_AMOUNT,
  SUBTOTAL_LIMIT_DIVISOR: 10,
  RESTORATION_MS: ms('7d'),
} as const;
export const COIN_PROGRAM_STATUS = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  STOPPED: 'STOPPED',
} as const;
