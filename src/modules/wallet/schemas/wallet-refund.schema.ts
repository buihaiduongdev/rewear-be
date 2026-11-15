import z from 'zod';

import { vndAmountSchema } from '@/common/schemas/money.schema';

export const orderRefundSchema = z
  .object({
    subtotal: vndAmountSchema,
    shippingFee: vndAmountSchema,
    total: vndAmountSchema,
  })
  .refine((order) => order.total === order.subtotal + order.shippingFee, {
    path: ['total'],
    message: 'Order total must equal subtotal plus shipping fee',
  });
