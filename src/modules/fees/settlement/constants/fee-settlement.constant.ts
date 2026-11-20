import ms from 'ms';

export const FEE_SETTLEMENT_RECORD = {
  RETURN_CHARGE: 'RETURN_CHARGE',
  REFUND: 'REFUND',
  SHOP: 'SHOP',
} as const;
export const FEE_SETTLEMENT_POLICY = {
  BATCH_SIZE: 100,
  WORKER_INTERVAL_MS: ms('30s'),
} as const;
