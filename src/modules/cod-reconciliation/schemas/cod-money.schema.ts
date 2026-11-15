import z from 'zod';

import { BASIS_POINTS_SCALE } from '@/common/constants/money.constants';

import { vndSchema } from './cod-reconciliation.schema';

export const reconciliationMoneySchema = z
  .object({
    subtotal: vndSchema,
    shippingFee: vndSchema,
    total: vndSchema,
    commissionBasisPoints: z.number().int().min(0).max(BASIS_POINTS_SCALE),
    items: z
      .array(z.object({ productId: z.string().min(1), price: vndSchema }))
      .max(100),
  })
  .refine(
    (order) =>
      order.subtotal + order.shippingFee === order.total &&
      order.items.reduce((sum, item) => sum + item.price, 0) ===
        order.subtotal &&
      new Set(order.items.map((item) => item.productId)).size ===
        order.items.length,
  );
