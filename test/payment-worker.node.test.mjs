import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

import { loadTypeScriptModule } from './support/typescript-module-loader.mjs';

const load = (file) => loadTypeScriptModule(new URL(file, import.meta.url));
class PaymentAttempt {}
class PaymentRefund {}
const errors = [];
class Logger {
  error(msg) {
    errors.push(msg);
  }
  warn() {}
}
globalThis.__workerDependencies = {
  ...(await load('../src/modules/payment/constants/payment.constant.ts')),
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
  .replace(/@Inject\(PAYOS_CLIENT\)/g, '');
const { PaymentWorker } = await import(
  `data:text/javascript;base64,${Buffer.from(`const { ${Object.keys(globalThis.__workerDependencies).join(', ')} } = globalThis.__workerDependencies;\n${stripTypeScriptTypes(source, { mode: 'transform' })}\n//# sourceURL=payment-worker-under-test.js`).toString('base64')}`
);

function fixture() {
  errors.length = 0;
  let now = 1000;
  const refund = {
    id: 'refund-1',
    paymentId: 'payment-1',
    providerTransId: 'FT24001',
    amount: 230000,
    state: 'QUEUED',
    createdAt: new Date(now),
    nextQueryAt: new Date(now),
    alertedAt: null,
  };
  const manager = {
    query: async (sql) =>
      sql.includes('clock_timestamp') ? [{ now: new Date(now) }] : [],
    findOne: async () => refund,
    save: async (value) => value,
  };
  let queue = Promise.resolve();
  const db = {
    transaction: (run) => {
      const result = queue.then(() => run(manager));
      queue = result.catch(() => {});
      return result;
    },
  };
  return {
    worker: new PaymentWorker(db, {}, {}),
    refund,
    advance: () => {
      now += 3600001;
    },
  };
}

test('PayOS refunds escalate once to REVIEW_REQUIRED with operational alert and do not emit duplicate alerts on lease retry', async () => {
  const f = fixture();
  await Promise.all([f.worker.refund('refund-1'), f.worker.refund('refund-1')]);
  assert.equal(f.refund.state, 'REVIEW_REQUIRED');
  assert.ok(f.refund.alertedAt);
  assert.equal(errors.length, 1);
  f.advance();
  await f.worker.refund('refund-1');
  assert.equal(errors.length, 1);
});

test('completed refunds are skipped without re-alerting', async () => {
  const f = fixture();
  f.refund.state = 'COMPLETED';
  await f.worker.refund('refund-1');
  assert.equal(f.refund.alertedAt, null);
  assert.equal(errors.length, 0);
});
