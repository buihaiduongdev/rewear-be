import ms from 'ms';

export const RETURN_BOOKING_STATE = {
  PREPARING: 'PREPARING',
  CREATING: 'CREATING',
  UNKNOWN: 'UNKNOWN',
  BOOKED: 'BOOKED',
} as const;
export type ReturnBookingState =
  (typeof RETURN_BOOKING_STATE)[keyof typeof RETURN_BOOKING_STATE];
export const RETURN_BOOKING_INSTRUCTIONS =
  'Prepaid return: pack the disputed item securely and hand it to GHN using this label. Do not pay any shipping fee upfront. Keep handover evidence. Contact support if pickup is unavailable.';
export const RETURN_BOOKING_POLICY = {
  POLL_INTERVAL_MS: ms('30s'),
  QUERY_LEASE_MS: ms('75s'),
  BATCH_SIZE: 50,
  PAYMENT_TYPE: 1,
  COD_AMOUNT: 0,
  DECLARED_VALUE: 0,
  HEAVY_PARCEL_GRAMS: 20000,
  STANDARD_SERVICE: 2,
  HEAVY_SERVICE: 5,
  CONTENT: 'Rewear disputed item return',
} as const;
