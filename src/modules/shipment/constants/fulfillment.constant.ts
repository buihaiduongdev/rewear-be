import ms from 'ms';

export const FULFILLMENT_POLICY = {
  UNKNOWN_ESCALATION_MS: ms('30m'),
  QUERY_LEASE_MS: ms('75s'),
  QUERY_INTERVAL_MS: ms('1m'),
  PROVIDER_CLOCK_TOLERANCE_MS: ms('5m'),
} as const;
