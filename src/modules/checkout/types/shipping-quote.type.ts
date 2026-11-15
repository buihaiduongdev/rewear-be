import type z from 'zod';

import type {
  quoteOrderSchema,
  shippingQuoteSchema,
} from '../schemas/shipping-quote.schema';

export type ShippingQuoteResult = z.output<typeof shippingQuoteSchema>;

export type QuoteOrder = z.output<typeof quoteOrderSchema>;
