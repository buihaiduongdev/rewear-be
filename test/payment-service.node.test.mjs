import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const load = async (file) => {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  return import(
    `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`
  );
};
const policy = await load('../src/modules/payment/payment.policy.ts');
class Checkout {}
class Product {}
class Shop {}
class Cart {}
class CartItem {}
class PaymentAttempt {}
class PaymentRefund {}
class Order {}
class OrderEvent {}
class ApplicationError extends Error {}
const In = (values) => ({ values });
const deps = {
  randomUUID,
  In,
  ...policy,
  Checkout,
  Product,
  Shop,
  Cart,
  CartItem,
  PaymentAttempt,
  PaymentRefund,
  Order,
  OrderEvent,
  ProductStatus: { HELD: 'HELD', SOLD: 'SOLD' },
  ShopStatus: { ACTIVE: 'ACTIVE' },
  ConflictException: ApplicationError,
  UnauthorizedException: ApplicationError,
  ServiceUnavailableException: ApplicationError,
};
globalThis.__paymentServiceTestDependencies = deps;
const original = await readFile(
  new URL('../src/modules/payment/payment.service.ts', import.meta.url),
  'utf8',
);
// Erase framework imports/decorators only; execute the production service body.
// This is an isolated service test with fake persistence, not PostgreSQL evidence.
const transformed = original
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
  .replace(/@Injectable\(\)/g, '')
  .replace(/@Inject\(MOMO_CLIENT\)/g, '');
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
    create: async (input) => {
      createCalls++;
      return {
        ...input,
        resultCode: 0,
        payUrl: 'https://test-payment.momo.vn/pay',
      };
    },
  };
  const service = new PaymentService(db, client, {
    quote: async () => ({}),
    snapshot: async () => snapshot,
  });
  return { service, rows, checkout, client, calls: () => createCalls };
}
const paid = (id, transId = 12345, amount = 230000) => ({
  partnerCode: 'TEST',
  orderId: id,
  requestId: id,
  amount,
  transId,
  resultCode: 0,
});

test('same client request, including concurrent calls, creates only one provider request', async () => {
  const f = setup();
  const result = await Promise.all([
    f.service.create('buyer', 'checkout', 'request'),
    f.service.create('buyer', 'checkout', 'request'),
  ]);
  assert.equal(result[0].id, result[1].id);
  assert.equal(f.calls(), 1);
  await assert.rejects(f.service.findMine('stranger', result[0].id));
  await assert.rejects(f.service.create('buyer', 'checkout', 'another'));
});

test('duplicate settlement is monotonic, creates one pending order, and reserves 24 hours', async () => {
  const f = setup();
  const attempt = await f.service.create('buyer', 'checkout', 'request');
  await Promise.all([
    f.service.applyResult(attempt.id, paid(attempt.id)),
    f.service.applyResult(attempt.id, paid(attempt.id)),
  ]);
  await f.service.applyResult(attempt.id, {
    ...paid(attempt.id),
    resultCode: 1006,
  });
  assert.equal(f.rows(Order).length, 1);
  assert.equal(f.checkout.status, 'PAID');
  assert.equal(f.rows(Product)[0].status, 'SOLD');
  assert.equal(f.rows(Order)[0].sellerConfirmBy.getTime(), 86401000);
});

test('create response arriving after IPN never overwrites settlement', async () => {
  const f = setup();
  f.client.create = async (input) => {
    await f.service.applyResult(input.orderId, paid(input.orderId));
    return {
      ...input,
      resultCode: 0,
      payUrl: 'https://test-payment.momo.vn/pay',
    };
  };
  assert.equal(
    (await f.service.create('buyer', 'checkout', 'request')).state,
    'PAID',
  );
});

test('an early pending query during create does not discard its eventual valid payUrl', async () => {
  const f = setup();
  f.client.create = async (input) => {
    await f.service.applyResult(input.orderId, {
      ...paid(input.orderId),
      resultCode: 1000,
    });
    return {
      ...input,
      resultCode: 0,
      payUrl: 'https://test-payment.momo.vn/pay',
    };
  };
  const result = await f.service.create('buyer', 'checkout', 'request');
  assert.equal(result.state, 'PENDING');
  assert.equal(result.payUrl, 'https://test-payment.momo.vn/pay');
});

test('cancelled/expired and wrong amounts persist refunds without reviving or selling stock', async () => {
  for (const change of ['CANCELLED', 'EXPIRED', 'wrong-amount']) {
    const f = setup();
    const attempt = await f.service.create('buyer', 'checkout', 'request');
    if (change !== 'wrong-amount') f.checkout.status = change;
    await f.service.applyResult(
      attempt.id,
      paid(attempt.id, 12345, change === 'wrong-amount' ? 220000 : 230000),
    );
    assert.equal(f.rows(Order).length, 0);
    assert.equal(f.rows(Product)[0].status, 'HELD');
    assert.equal(f.rows(PaymentRefund).length, 1);
  }
});

test('a second actual capture has its own durable refund, repeated notification does not duplicate it', async () => {
  const f = setup();
  const attempt = await f.service.create('buyer', 'checkout', 'request');
  await f.service.applyResult(attempt.id, paid(attempt.id));
  await f.service.applyResult(attempt.id, paid(attempt.id, 54321));
  await f.service.applyResult(attempt.id, paid(attempt.id, 54321));
  assert.equal(f.rows(Order).length, 1);
  assert.equal(f.rows(PaymentRefund).length, 1);
  assert.equal(f.rows(PaymentRefund)[0].providerTransId, '54321');
});

test('a new capture after a previous refund reopens the outstanding refund state', async () => {
  const f = setup();
  const attempt = await f.service.create('buyer', 'checkout', 'request');
  f.checkout.status = 'CANCELLED';
  await f.service.applyResult(attempt.id, paid(attempt.id));
  f.rows(PaymentAttempt)[0].state = 'REFUNDED';
  f.rows(PaymentRefund)[0].state = 'COMPLETED';
  await f.service.applyResult(attempt.id, paid(attempt.id, 54321));
  assert.equal(f.rows(PaymentRefund).length, 2);
  assert.equal(f.rows(PaymentAttempt)[0].state, 'REFUND_REQUIRED');
  f.rows(PaymentAttempt)[0].state = 'REFUNDED';
  f.rows(PaymentRefund).forEach((refund) => {
    refund.state = 'COMPLETED';
  });
  await f.service.applyResult(attempt.id, paid(attempt.id, 54321));
  assert.equal(f.rows(PaymentAttempt)[0].state, 'REFUNDED');
});
