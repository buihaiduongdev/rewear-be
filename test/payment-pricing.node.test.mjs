import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

import { loadTypeScriptModule } from './support/typescript-module-loader.mjs';

const constants = await loadTypeScriptModule(
  new URL(
    '../src/modules/checkout/constants/shipping-quote.constant.ts',
    import.meta.url,
  ),
);
const coinConstants = await loadTypeScriptModule(
  new URL('../src/modules/coins/constants/coin.constant.ts', import.meta.url),
);
const coinSource = (
  await readFile(
    new URL('../src/modules/coins/coin.service.ts', import.meta.url),
    'utf8',
  )
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
  .replace(/@Injectable\(\)/g, '');
globalThis.__coinServiceTestDependencies = {
  ...coinConstants,
  BadRequestException: Error,
  ConflictException: Error,
  In: (values) => ({ values }),
  Order: class {},
  CoinAccount: class {},
  CoinOrderDebit: class {},
  CoinPurchaseReward: class {},
  CoinReservation: class {},
};
const { allocateCoins } = await import(
  `data:text/javascript;base64,${Buffer.from(`const { ${Object.keys(globalThis.__coinServiceTestDependencies).join(', ')} } = globalThis.__coinServiceTestDependencies;\n${stripTypeScriptTypes(coinSource, { mode: 'transform' })}\n//# sourceURL=coin-service-under-test.js`).toString('base64')}`
);
let quote;
globalThis.__paymentPricingDependencies = {
  ...constants,
  allocateCoins,
  ConflictException: Error,
  CheckoutOrder: class {},
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
  `data:text/javascript;base64,${Buffer.from(`const { allocateCoins, ConflictException, CheckoutOrder, SHIPPING_QUOTE_STATUS, SHIPPING_QUOTE_ORDER_STATUS, SHIPPING_QUOTE_MAX_AGE_MS } = globalThis.__paymentPricingDependencies;\n${stripTypeScriptTypes(source, { mode: 'transform' })}\n//# sourceURL=payment-pricing-under-test.js`).toString('base64')}`
);

test('pricing requires a current complete server quote and snapshots Shop money, address and items', async () => {
  const order = {
    id: 'order',
    shopId: 'shop',
    shop: { name: 'Shop' },
    subtotal: 200000,
    address: { recipientName: 'Buyer' },
    items: [{ productId: 'product', price: 200000 }],
  };
  const manager = { find: async () => [order] };
  const pricing = new PaymentPricing();
  quote = {
    status: 'READY',
    grandTotal: 230000,
    quotedAt: new Date().toISOString(),
    orders: [
      { orderId: 'order', shopId: 'shop', status: 'QUOTED', fee: 30000 },
    ],
  };
  const prepared = () => ({ checkoutId: 'checkout', quote });
  assert.deepEqual(
    await pricing.snapshot(manager, { id: 'checkout' }, prepared()),
    [
      {
        coinDiscount: 0,
        coinMode: null,
        checkoutOrderId: 'order',
        shopId: 'shop',
        shopName: 'Shop',
        subtotal: 200000,
        shippingFee: 30000,
        address: order.address,
        items: order.items.map((item) => ({ ...item, coinDiscount: 0 })),
      },
    ],
  );
  await assert.rejects(
    pricing.snapshot(
      manager,
      { id: 'checkout', identityReviewRequired: true },
      prepared(),
    ),
  );
  quote.status = 'EXPIRED';
  await assert.rejects(
    pricing.snapshot(manager, { id: 'checkout' }, prepared()),
  );
  quote.status = 'READY';
  quote.grandTotal = 1;
  await assert.rejects(
    pricing.snapshot(manager, { id: 'checkout' }, prepared()),
  );
  quote.grandTotal = 230000;
  quote.orders[0].shopId = 'different-shop';
  await assert.rejects(
    pricing.snapshot(manager, { id: 'checkout' }, prepared()),
  );
  quote.orders[0].shopId = 'shop';
  quote.quotedAt = new Date(Date.now() - 60000).toISOString();
  await assert.rejects(
    pricing.snapshot(manager, { id: 'checkout' }, prepared()),
  );
});
