import z from 'zod';

import { vndAmountSchema } from '@/common/schemas/money.schema';

export const orderRefundSchema = z
  .object({
    subtotal: vndAmountSchema,
    shippingFee: vndAmountSchema,
    total: vndAmountSchema,
    coinDiscount: vndAmountSchema.default(0),
  })
  .refine(
    (order) =>
      order.total + order.coinDiscount === order.subtotal + order.shippingFee &&
      order.coinDiscount <= Math.ceil(order.subtotal / 10) &&
      vndAmountSchema.safeParse(order.subtotal + order.shippingFee).success,
    {
      path: ['total'],
      message: 'Order cash and coins must match gross goods plus shipping',
    },
  );
