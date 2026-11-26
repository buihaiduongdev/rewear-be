import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

import ms from 'ms';

import { loadTypeScriptModule } from './support/typescript-module-loader.mjs';

const load = (file) => loadTypeScriptModule(new URL(file, import.meta.url));
const policy = await load('../src/modules/payment/policies/payment.policy.ts');
class Checkout {}
class Product {}
class Shop {}
class Cart {}
class CartItem {}
class PaymentAttempt {}
class PaymentRefund {}
class Order {}
class OrderEvent {}
class WalletCheckoutHold {}
class CoinService {
  async consumeCheckoutCoins(_manager, _checkoutId, orders) {
    assert.equal(
      orders.reduce((sum, order) => sum + (order.coinDiscount ?? 0), 0),
      0,
    );
  }
}
class ApplicationError extends Error {}
const In = (values) => ({ values });
const generatePayosOrderCode = () => Date.now() * 1000 + randomInt(1000);
const isIncludedInAggregateTransId = (aggregateId, providerTransId) =>
  Boolean(
    aggregateId &&
      providerTransId &&
      aggregateId.startsWith('plink:') &&
      aggregateId.slice('plink:'.length).split('+').includes(providerTransId),
  );
const deps = {
  ms,
  randomUUID,
  generatePayosOrderCode,
  isIncludedInAggregateTransId,
  In,
  ...policy,
  ...(await load(
    '../src/modules/shop/applications/renewal/identity-sale.policy.ts',
  )),
  ...(await load('../src/modules/payment/constants/payment.constant.ts')),
  ...(await load('../src/modules/checkout/constants/checkout.constant.ts')),
  ...(await load('../src/common/constants/money.constant.ts')),
  ...(await load('../src/modules/order/constants/order.constant.ts')),
  ...(await load('../src/modules/wallet/constants/wallet.constant.ts')),
  ...(await load('../src/modules/event/constants/event-type.constant.ts')),
  OutboxService: class {
    record() {}
  },
  Checkout,
  Product,
  Shop,
  Cart,
  CartItem,
  PaymentAttempt,
  PaymentRefund,
  Order,
  OrderEvent,
  WalletCheckoutHold,
  CoinService,
  RECONCILIATION_MODE: { EVIDENCE: 'EVIDENCE', SIMULATION: 'SIMULATION' },
  ProductStatus: { HELD: 'HELD', SOLD: 'SOLD' },
  ShopStatus: { ACTIVE: 'ACTIVE' },
  ConflictException: ApplicationError,
  NotFoundException: ApplicationError,
  UnauthorizedException: ApplicationError,
  ServiceUnavailableException: ApplicationError,
};
globalThis.__paymentServiceTestDependencies = deps;
const original = await readFile(
  new URL('../src/modules/payment/payment.service.ts', import.meta.url),
  'utf8',
);
const transformed = original
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
  .replace(/@Injectable\(\)/g, '')
  .replace(/@Inject\(PAYOS_CLIENT\)/g, '');
const { PaymentService } = await import(
  `data:text/javascript;base64,${Buffer.from(`const { ${Object.keys(deps).join(', ')} } = globalThis.__paymentServiceTestDependencies;\n${stripTypeScriptTypes(transformed, { mode: 'transform' })}\n//# sourceURL=payment-service-under-test.js`).toString('base64')}`
);

function setup() {
  const tables = new Map();
  const rows = (type) => {
    if (!tables.has(type)) tables.set(type, []);
    return tables.get(type);
  };
  const matches = (row, where) =>
    Object.entries(where).every(([key, value]) =>
      value && typeof value === 'object' && 'values' in value
        ? value.values.includes(row[key])
        : row[key] === value,
    );
  const manager = {
    query: async (sql) =>
      sql.includes('clock_timestamp') ? [{ now: new Date(1000) }] : [],
    find: async (type, options) =>
      rows(type).filter((row) => matches(row, options.where)),
    findOneBy: async (type, where) =>
      rows(type).find((row) => matches(row, where)) ?? null,
    findOneByOrFail: async (type, where) => {
      const row = await manager.findOneBy(type, where);
      if (!row) throw new Error('Not found');
      return row;
    },
    findOne: async (type, options) => manager.findOneBy(type, options.where),
    findOneOrFail: async (type, options) =>
      manager.findOneByOrFail(type, options.where),
    existsBy: async (type, where) =>
      rows(type).some((row) => matches(row, where)),
    create: (type, input) => Object.assign(new type(), input),
    save: async (type, input) => {
      if (!input) {
        input = type;
        type = input.constructor;
      }
      input.id ??= randomUUID();
      input.createdAt ??= new Date(1000);
      if (!rows(type).some((row) => row.id === input.id))
        rows(type).push(input);
      return input;
    },
    update: async (type, where, changes) => {
      const found = rows(type).filter((row) =>
        matches(row, typeof where === 'string' ? { id: where } : where),
      );
      found.forEach((row) => Object.assign(row, changes));
      return { affected: found.length };
    },
    delete: async () => {},
  };
  let queue = Promise.resolve();
  const db = {
    getRepository: (type) => ({
      findOneByOrFail: (where) => manager.findOneByOrFail(type, where),
      findOneBy: (where) => manager.findOneBy(type, where),
      find: (options) => manager.find(type, options),
      update: (where, changes) => manager.update(type, where, changes),
    }),
    transaction: (run) => {
      const result = queue.then(() => run(manager));
      queue = result.catch(() => {});
      return result;
    },
  };
  const checkout = Object.assign(new Checkout(), {
    id: 'checkout',
    buyerId: 'buyer',
    status: 'HELD',
    expiresAt: new Date(601000),
    requestedProductIds: ['product'],
  });
  rows(Checkout).push(checkout);
  rows(Product).push({
    id: 'product',
    status: 'HELD',
    reservationId: checkout.id,
  });
  rows(Shop).push({ id: 'shop', status: 'ACTIVE' });
  const snapshot = [
    {
      checkoutOrderId: 'provisional-order',
      shopId: 'shop',
      shopName: 'Shop',
      subtotal: 200000,
      shippingFee: 30000,
      address: {},
      items: [{ productId: 'product', price: 200000 }],
    },
  ];
  let createCalls = 0;
  const client = {
    createPaymentLink: async (input) => {
      createCalls++;
      return {
        orderCode: input.orderCode,
        paymentLinkId: 'plink-1',
        status: 'PENDING',
        checkoutUrl: 'https://pay.payos.vn/web/plink-1',
        qrCode: 'qr',
      };
    },
  };
  const service = new PaymentService(
    db,
    client,
    {
      quote: async () => ({}),
      snapshot: async () => snapshot,
    },
    { record: async () => undefined },
  );
  return { service, rows, checkout, client, calls: () => createCalls };
}

const paid = (attemptOrOrderCode, transId = 'FT24001', amount = 230000) => ({
  orderCode:
    typeof attemptOrOrderCode === 'object'
      ? Number(attemptOrOrderCode.providerOrderCode)
      : attemptOrOrderCode,
  status: 'PAID',
  amount,
  amountPaid: amount,
  providerTransId: transId,
});

test('identity restriction prevents new PayOS requests and refunds an inflight captured payment', async () => {
  const blocked = setup();
  blocked.rows(Shop)[0].identityManualRestriction = true;
  await assert.rejects(
    blocked.service.create('buyer', 'checkout', { requestId: 'blocked' }),
    /identity/,
  );
  assert.equal(blocked.calls(), 0);
  for (const condition of ['restricted', 'review-required']) {
    const f = setup();
    await f.service.create('buyer', 'checkout', { requestId: 'request' });
    const attempt = f.rows(PaymentAttempt)[0];
    if (condition === 'restricted')
      f.rows(Shop)[0].identityManualRestriction = true;
    else f.checkout.identityReviewRequired = true;
    await f.service.applyResult(attempt.id, paid(attempt));
    assert.equal(f.rows(Order).length, 0);
    assert.equal(f.rows(PaymentRefund).length, 1);
    assert.equal(f.rows(Product)[0].status, 'HELD');
  }
});

test('same client request, including concurrent calls, creates only one provider request', async () => {
  const f = setup();
  const result = await Promise.all([
    f.service.create('buyer', 'checkout', { requestId: 'request' }),
    f.service.create('buyer', 'checkout', { requestId: 'request' }),
  ]);
  assert.equal(result[0].id, result[1].id);
  assert.equal(f.calls(), 1);
  await assert.rejects(f.service.findMine('stranger', result[0].id));
  await assert.rejects(
    f.service.create('buyer', 'checkout', { requestId: 'another' }),
  );
});

test('duplicate settlement is monotonic, creates one pending order, and reserves 24 hours', async () => {
  const f = setup();
  await f.service.create('buyer', 'checkout', { requestId: 'request' });
  const attempt = f.rows(PaymentAttempt)[0];
  await Promise.all([
    f.service.applyResult(attempt.id, paid(attempt)),
    f.service.applyResult(attempt.id, paid(attempt)),
  ]);
  await f.service.applyResult(attempt.id, {
    ...paid(attempt),
    status: 'CANCELLED',
  });
  assert.equal(f.rows(Order).length, 1);
  assert.equal(f.checkout.status, 'PAID');
  assert.equal(f.rows(Product)[0].status, 'SOLD');
  assert.equal(f.rows(Order)[0].sellerConfirmBy.getTime(), 86401000);
});

test('create response arriving after webhook never overwrites settlement', async () => {
  const f = setup();
  f.client.createPaymentLink = async (input) => {
    const attempt = f.rows(PaymentAttempt)[0];
    await f.service.applyResult(attempt.id, paid(input.orderCode));
    return {
      orderCode: input.orderCode,
      paymentLinkId: 'plink-1',
      status: 'PENDING',
      checkoutUrl: 'https://pay.payos.vn/web/plink-1',
      qrCode: 'qr',
    };
  };
  assert.equal(
    (await f.service.create('buyer', 'checkout', { requestId: 'request' }))
      .state,
    'PAID',
  );
});

test('cancelled/expired and wrong amounts persist refunds without reviving or selling stock', async () => {
  for (const change of ['CANCELLED', 'EXPIRED', 'wrong-amount']) {
    const f = setup();
    await f.service.create('buyer', 'checkout', { requestId: 'request' });
    const attempt = f.rows(PaymentAttempt)[0];
    if (change !== 'wrong-amount') f.checkout.status = change;
    await f.service.applyResult(
      attempt.id,
      paid(attempt, 'FT24001', change === 'wrong-amount' ? 220000 : 230000),
    );
    assert.equal(f.rows(Order).length, 0);
    assert.equal(f.rows(Product)[0].status, 'HELD');
    assert.equal(f.rows(PaymentRefund).length, 1);
  }
});

test('a second actual capture has its own durable refund, repeated webhook does not duplicate it', async () => {
  const f = setup();
  await f.service.create('buyer', 'checkout', { requestId: 'request' });
  const attempt = f.rows(PaymentAttempt)[0];
  await f.service.applyResult(attempt.id, paid(attempt));
  await f.service.applyResult(attempt.id, paid(attempt, 'FT24002'));
  await f.service.applyResult(attempt.id, paid(attempt, 'FT24002'));
  assert.equal(f.rows(Order).length, 1);
  assert.equal(f.rows(PaymentRefund).length, 1);
  assert.equal(f.rows(PaymentRefund)[0].providerTransId, 'FT24002');
});

test('a new capture after a previous refund reopens the outstanding refund state', async () => {
  const f = setup();
  await f.service.create('buyer', 'checkout', { requestId: 'request' });
  const attempt = f.rows(PaymentAttempt)[0];
  f.checkout.status = 'CANCELLED';
  await f.service.applyResult(attempt.id, paid(attempt));
  attempt.state = 'REFUNDED';
  f.rows(PaymentRefund)[0].state = 'COMPLETED';
  await f.service.applyResult(attempt.id, paid(attempt, 'FT24002'));
  assert.equal(f.rows(PaymentRefund).length, 2);
  assert.equal(attempt.state, 'REFUND_REQUIRED');
  attempt.state = 'REFUNDED';
  f.rows(PaymentRefund).forEach((refund) => {
    refund.state = 'COMPLETED';
  });
  await f.service.applyResult(attempt.id, paid(attempt, 'FT24002'));
  assert.equal(attempt.state, 'REFUNDED');
});

test('multi-transfer settled or expired links deduplicate delayed per-transfer webhooks without double refunds', async () => {
  const settled = setup();
  await settled.service.create('buyer', 'checkout', { requestId: 'req-settled' });
  const a1 = settled.rows(PaymentAttempt)[0];
  await settled.service.applyResult(a1.id, {
    orderCode: Number(a1.providerOrderCode),
    status: 'PAID',
    amount: a1.amount,
    amountPaid: a1.amount,
    providerTransId: 'plink:FT1+FT2',
    transactions: [
      { providerTransId: 'FT1', amount: 100000 },
      { providerTransId: 'FT2', amount: a1.amount - 100000 },
    ],
  });
  await settled.service.applyResult(a1.id, {
    orderCode: Number(a1.providerOrderCode),
    status: 'PAID',
    amount: 100000,
    amountPaid: 100000,
    providerTransId: 'FT1',
  });
  assert.equal(settled.rows(Order).length, 1);
  assert.equal(settled.rows(PaymentRefund).length, 0);

  const expired = setup();
  await expired.service.create('buyer', 'checkout', { requestId: 'req-expired' });
  const a2 = expired.rows(PaymentAttempt)[0];
  await expired.service.applyResult(a2.id, {
    orderCode: Number(a2.providerOrderCode),
    status: 'EXPIRED',
    amount: a2.amount,
    amountPaid: 7000,
    providerTransId: 'plink:FT1+FT2',
    transactions: [
      { providerTransId: 'FT1', amount: 3000 },
      { providerTransId: 'FT2', amount: 4000 },
    ],
  });
  await expired.service.applyResult(a2.id, {
    orderCode: Number(a2.providerOrderCode),
    status: 'PAID',
    amount: 3000,
    amountPaid: 3000,
    providerTransId: 'FT1',
  });
  assert.equal(expired.rows(PaymentRefund).length, 2);
  assert.deepEqual(
    expired
      .rows(PaymentRefund)
      .map((r) => ({ id: r.providerTransId, amount: r.amount })),
    [
      { id: 'FT1', amount: 3000 },
      { id: 'FT2', amount: 4000 },
    ],
  );
});
