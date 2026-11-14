import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

class PaymentAttempt {}
class PaymentRefund {}
class Logger {
  error() {}
  warn() {}
}
globalThis.__workerDependencies = {
  randomUUID,
  PaymentAttempt,
  PaymentRefund,
  Logger,
};
const source = (
  await readFile(
    new URL('../src/modules/payment/payment.worker.ts', import.meta.url),
    'utf8',
  )
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
  .replace(/@Injectable\(\)/g, '')
  .replace(/@Inject\(MOMO_CLIENT\)/g, '');
const { PaymentWorker } = await import(
  `data:text/javascript;base64,${Buffer.from(`const { randomUUID, PaymentAttempt, PaymentRefund, Logger } = globalThis.__workerDependencies;\n${stripTypeScriptTypes(source, { mode: 'transform' })}\n//# sourceURL=payment-worker-under-test.js`).toString('base64')}`
);

function fixture() {
  let now = 1000;
  const refund = {
    id: 'refund-1',
    paymentId: 'payment-1',
    providerTransId: '999',
    amount: 230000,
    state: 'QUEUED',
    createdAt: new Date(now),
    nextQueryAt: new Date(now),
    alertedAt: null,
  };
  const payment = {
    id: 'payment-1',
    providerTransId: '123',
    state: 'REFUND_REQUIRED',
  };
  const manager = {
    query: async (sql) =>
      sql.includes('clock_timestamp') ? [{ now: new Date(now) }] : [],
    findOneByOrFail: async (type) =>
      type === PaymentRefund ? refund : payment,
    find: async () => [refund],
    save: async (value) => value,
    update: async (_type, where, values) => {
      if (payment.state === where.state) Object.assign(payment, values);
    },
  };
  let queue = Promise.resolve();
  const db = {
    transaction: (run) => {
      const result = queue.then(() => run(manager));
      queue = result.catch(() => {});
      return result;
    },
  };
  let submits = 0;
  let queries = 0;
  let confirms = false;
  const client = {
    refund: async (input) => {
      submits++;
      assert.equal(input.transId, 999);
      throw Error('lost response');
    },
    queryRefund: async (orderId, requestId, amount) => {
      queries++;
      assert.equal(orderId, 'refund-1');
      assert.notEqual(requestId, 'refund-1');
      assert.equal(amount, 230000);
      return confirms;
    },
  };
  const siblings = [refund];
  manager.find = async () => siblings;
  return {
    worker: new PaymentWorker(db, {}, client),
    refund,
    payment,
    siblings,
    advance: () => {
      now += 76000;
    },
    confirm: () => {
      confirms = true;
    },
    counts: () => ({ submits, queries }),
  };
}

test('refund timeout persists UNKNOWN and never submits a second refund, even with concurrent workers', async () => {
  const f = fixture();
  await Promise.all([f.worker.refund('refund-1'), f.worker.refund('refund-1')]);
  assert.equal(f.refund.state, 'UNKNOWN');
  assert.deepEqual(f.counts(), { submits: 1, queries: 0 });
  f.advance();
  await f.worker.refund('refund-1');
  assert.equal(f.refund.state, 'UNKNOWN');
  assert.deepEqual(f.counts(), { submits: 1, queries: 1 });
  f.advance();
  f.confirm();
  await f.worker.refund('refund-1');
  assert.equal(f.refund.state, 'COMPLETED');
  assert.equal(f.payment.state, 'REFUNDED');
  assert.deepEqual(f.counts(), { submits: 1, queries: 2 });
});

test('out-of-range or definitively rejected refund stays review-required without unsafe retries', async () => {
  const f = fixture();
  f.refund.state = 'REVIEW_REQUIRED';
  await f.worker.refund('refund-1');
  assert.ok(f.refund.alertedAt);
  assert.deepEqual(f.counts(), { submits: 0, queries: 0 });
  assert.equal(f.payment.state, 'REFUND_REQUIRED');
});

test('one completed refund does not mark an attempt fully refunded while another capture is outstanding', async () => {
  const f = fixture();
  f.siblings.push({
    ...f.refund,
    id: 'refund-2',
    providerTransId: '888',
    state: 'UNKNOWN',
  });
  f.refund.state = 'UNKNOWN';
  f.confirm();
  await f.worker.refund('refund-1');
  assert.equal(f.refund.state, 'COMPLETED');
  assert.equal(f.payment.state, 'REFUND_REQUIRED');
});
