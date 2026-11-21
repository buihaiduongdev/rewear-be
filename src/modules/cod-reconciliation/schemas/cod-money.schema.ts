import z from 'zod';

import { BASIS_POINTS_SCALE } from '@/common/constants/money.constant';

import { vndSchema } from './cod-reconciliation.schema';

export const reconciliationMoneySchema = z
  .object({
    subtotal: vndSchema,
    shippingFee: vndSchema,
    total: vndSchema,
    coinDiscount: vndSchema.default(0),
    commissionBasisPoints: z.number().int().min(0).max(BASIS_POINTS_SCALE),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          price: vndSchema,
          coinDiscount: vndSchema.default(0),
        }),
      )
      .max(100),
  })
  .refine(
    (order) =>
      order.subtotal + order.shippingFee === order.total + order.coinDiscount &&
      order.coinDiscount <= Math.ceil(order.subtotal / 10) &&
      order.items.every((item) => item.coinDiscount <= item.price) &&
      order.items.reduce((sum, item) => sum + item.coinDiscount, 0) ===
        order.coinDiscount &&
      order.items.reduce((sum, item) => sum + item.price, 0) ===
        order.subtotal &&
      new Set(order.items.map((item) => item.productId)).size ===
        order.items.length,
  );
