import { orderRefundSchema } from '@/modules/wallet/schemas/wallet-refund.schema';

describe('order cancellation refund validation', () => {
  it.each([
    { subtotal: 0, shippingFee: 0, total: 0 },
    { subtotal: 2147483647, shippingFee: 0, total: 2147483647 },
  ])('accepts valid VND snapshots including boundaries: %j', (input) => {
    expect(orderRefundSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    { subtotal: 2147483648, shippingFee: 0, total: 2147483648 },
    { subtotal: 200000, shippingFee: 30000, total: 1 },
    { subtotal: -1, shippingFee: 230001, total: 230000 },
    { subtotal: 0, shippingFee: -1, total: -1 },
    { subtotal: 0, shippingFee: 0, total: NaN },
    { subtotal: 200000.5, shippingFee: 29999.5, total: 230000 },
    { subtotal: '200000', shippingFee: 30000, total: 230000 },
    {
      subtotal: Number.MAX_SAFE_INTEGER,
      shippingFee: 0,
      total: Number.MAX_SAFE_INTEGER,
    },
  ])('rejects invalid refund money without coercion: %j', (input) => {
    expect(orderRefundSchema.safeParse(input).success).toBe(false);
  });
});
