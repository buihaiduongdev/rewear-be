import z from 'zod';

// VND is stored as a PostgreSQL integer on Order/WalletCredit.
const orderAmountSchema = z.number().int().nonnegative().max(2147483647);

export const orderRefundSchema = z
  .object({
    subtotal: orderAmountSchema,
    shippingFee: orderAmountSchema,
    total: orderAmountSchema,
  })
  .refine((order) => order.total === order.subtotal + order.shippingFee, {
    path: ['total'],
    message: 'Order total must equal subtotal plus shipping fee',
  });
