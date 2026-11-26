import ms from 'ms';

export const RETURN_STATE = {
  WAITING_LABEL: 'WAITING_LABEL',
  AWAITING_HANDOVER: 'AWAITING_HANDOVER',
  IN_TRANSIT: 'IN_TRANSIT',
  READY: 'READY',
  EXPIRED: 'EXPIRED',
} as const;

export const RETURN_POLICY = {
  HANDOVER_MS: ms('5d'),
  PAYMENT_TYPE: 1,
  COD_AMOUNT: 0,
  DECLARED_VALUE: 0,
  STANDARD_SERVICE: 2,
  HEAVY_SERVICE: 5,
  HEAVY_PARCEL_GRAMS: 20_000,
  CONTENT: 'Rewear return parcel',
} as const;

export const RETURN_BOOKING_INSTRUCTIONS =
  'Prepaid GHN return label; hand over parcel within 5 days.';
