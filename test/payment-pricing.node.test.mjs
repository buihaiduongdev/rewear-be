import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

let quote;
globalThis.__paymentPricingDependencies = {
  ConflictException: Error,
  CheckoutOrder: class {},
  effectiveShippingQuote: async () => quote,
};
const source = (
  await readFile(
    new URL('../src/modules/payment/payment.pricing.ts', import.meta.url),
    'utf8',
  )
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
  .replace(/@Injectable\(\)/g, '');
const { PaymentPricing } = await import(
  `data:text/javascript;base64,${Buffer.from(`const { ConflictException, CheckoutOrder, effectiveShippingQuote } = globalThis.__paymentPricingDependencies;\n${stripTypeScriptTypes(source, { mode: 'transform' })}\n//# sourceURL=payment-pricing-under-test.js`).toString('base64')}`
);

test('pricing requires a current complete server quote and snapshots Shop money, address and items', async () => {
  const order = {
    id: 'order',
    sourceType: 'SHOP',
    sourceId: 'shop',
    sourceName: 'Shop',
    subtotal: 200000,
    address: { recipientName: 'Buyer' },
    items: [{ productId: 'product', price: 200000 }],
  };
  const manager = { find: async () => [order] };
  const pricing = new PaymentPricing();
  quote = {
    status: 'READY',
    grandTotal: 230000,
    orders: [{ orderId: 'order', status: 'QUOTED', fee: 30000 }],
  };
  assert.deepEqual(await pricing.snapshot(manager, { id: 'checkout' }), [
    {
      checkoutOrderId: 'order',
      shopId: 'shop',
      shopName: 'Shop',
      subtotal: 200000,
      shippingFee: 30000,
      address: order.address,
      items: order.items,
    },
  ]);
  quote.status = 'EXPIRED';
  await assert.rejects(pricing.snapshot(manager, { id: 'checkout' }));
  quote.status = 'READY';
  quote.grandTotal = 1;
  await assert.rejects(pricing.snapshot(manager, { id: 'checkout' }));
  quote.grandTotal = 230000;
  order.sourceType = 'USER';
  await assert.rejects(pricing.snapshot(manager, { id: 'checkout' }));
});
