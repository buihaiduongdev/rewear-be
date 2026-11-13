import type { CarrierQuoteInput } from '@/infrastructure/shipping/ghn-sandbox.adapter';

export type QuoteInputSnapshot = {
  orderId: string;
  pickupId: string | null;
  pickupUpdatedAt: string | null;
  input: CarrierQuoteInput | null;
};
