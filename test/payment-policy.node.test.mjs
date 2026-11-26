import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTypeScriptModule } from './support/typescript-module-loader.mjs';

const load = (file) => loadTypeScriptModule(new URL(file, import.meta.url));
const policy = await load('../src/modules/payment/policies/payment.policy.ts');

test('a paid result settles only a live, matching, fully owned reservation once', () => {
  const input = {
    amount: 230000,
    expectedAmount: 230000,
    status: 'PAID',
    checkoutState: 'HELD',
    expiresAt: 2000,
    now: 1000,
    alreadyPaid: false,
    ownsAllProducts: true,
  };
  assert.equal(policy.captureDisposition(input), 'SETTLE');
  for (const change of [
    { amount: 229000 },
    { checkoutState: 'CANCELLED' },
    { checkoutState: 'EXPIRED' },
    { now: 2000 },
    { alreadyPaid: true },
    { ownsAllProducts: false },
    { status: 'EXPIRED', amount: 50000 },
    { status: 'CANCELLED', amount: 50000 },
    { status: 'UNDERPAID', amount: 50000, now: 2000 },
  ])
    assert.equal(policy.captureDisposition({ ...input, ...change }), 'REFUND');
  assert.equal(
    policy.captureDisposition({ ...input, status: 'EXPIRED', amount: 0 }),
    'FAILED',
  );
  assert.equal(
    policy.captureDisposition({
      ...input,
      status: 'UNDERPAID',
      amount: 50000,
      now: 1500,
    }),
    'UNKNOWN',
  );
});

test('unknown, pending, processing, and underpaid statuses never fulfil an order; explicit cancellation/expiry may retry', () => {
  for (const status of ['PENDING', 'PROCESSING', 'UNDERPAID', 'OTHER'])
    assert.equal(policy.providerOutcome(status), 'UNKNOWN');
  for (const status of ['CANCELLED', 'EXPIRED', 'FAILED'])
    assert.equal(policy.providerOutcome(status), 'FAILED');
  assert.equal(policy.providerOutcome('PAID'), 'PAID');
});

test('maximum three attempts, unknown blocks retries, repeated same request does not consume quota', () => {
  assert.equal(policy.canStartAttempt(['FAILED', 'FAILED']), true);
  assert.equal(policy.canStartAttempt(['FAILED', 'FAILED', 'FAILED']), false);
  for (const state of ['CREATING', 'PENDING', 'UNKNOWN', 'PAID'])
    assert.equal(policy.canStartAttempt([state]), false);
  assert.equal(policy.canStartAttempt(['REFUND_REQUIRED']), true);
});

test('reconciliation begins at 60 seconds or two minutes before hold expiry, whichever is earlier', () => {
  assert.equal(policy.firstReconciliationAt(1000, 601000), 61000);
  assert.equal(policy.firstReconciliationAt(590000, 601000), 590000);
});
