import { randomUUID } from 'node:crypto';

import { MomoSandboxClient } from '@/infrastructure/payment/momo-sandbox.client';
import {
  WalletAccount,
  WalletCredit,
} from '@/modules/wallet/entities/wallet.entity';
import {
  ExcessCapture,
  ExcessPayment,
  ExcessProviderRefund,
  WalletExcess,
} from '@/modules/wallet/excess/entities/excess.entity';
import { ExcessReturn } from '@/modules/wallet/excess/entities/excess.entity';
import { ExcessOperationsService } from '@/modules/wallet/excess/excess-operations.service';
import { ExcessAttemptService } from '@/modules/wallet/excess/payments/excess-attempt.service';
import { ExcessPaymentService } from '@/modules/wallet/excess/payments/excess-payment.service';
import { ExcessRefundService } from '@/modules/wallet/excess/payments/excess-refund.service';
import { offsetExcessRefund } from '@/modules/wallet/excess/policies/excess-accounting.policy';
import { WalletExcessService } from '@/modules/wallet/excess/wallet-excess.service';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';

describe('Wallet recovery MoMo (PostgreSQL)', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let recovery: WalletExcessService;
  let payments: ExcessPaymentService;
  const gateway = {
    create: jest.fn(async () => ({
      resultCode: 0,
      payUrl: 'https://test.local/pay',
    })),
    verifyIpn: jest.fn((x) => x),
    query: jest.fn(),
    refund: jest.fn(async () => ({ resultCode: 0 })),
    queryRefund: jest.fn(async () => true),
  };
  beforeAll(async () => {
    database = await createTestDatabase();
    recovery = new WalletExcessService(database.dataSource);
    payments = new ExcessPaymentService(
      database.dataSource,
      gateway as unknown as MomoSandboxClient,
      new ExcessAttemptService(
        database.dataSource,
        gateway as unknown as MomoSandboxClient,
      ),
      new ExcessRefundService(
        database.dataSource,
        gateway as unknown as MomoSandboxClient,
      ),
    );
  });
  afterAll(async () => database?.destroy());
  async function fixture() {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const credit = await db.getRepository(WalletCredit).save({
      userId: f.buyer.id,
      orderId: f.order.id,
      mode: 'SIMULATION',
      amount: 100000,
    });
    // Quarantined balance/held context leaves this source unavailable for immediate recovery.
    await db.getRepository(WalletAccount).save({
      userId: f.buyer.id,
      simulationBalance: 0,
      simulationHeldBalance: 100000,
    });
    const row = await recovery.verify(f.admin.id, {
      requestId: randomUUID(),
      sourceType: 'CANCELLATION',
      sourceId: credit.id,
      authorizedAmount: 60000,
      reason: 'Overcredit verified from original decision',
      evidence: 'Verified original decision document',
    });
    const payment = await payments.create(f.buyer.id, {
      requestId: randomUUID(),
      excessIds: [row.id],
      amount: 40000,
    });
    const result = {
      orderId: payment.id,
      requestId: payment.id,
      orderInfo: 'Rewear wallet recovery ' + payment.id,
      orderType: 'momo_wallet',
      resultCode: 0,
      amount: 40000,
      transId: Math.floor(Math.random() * 1000000000) + 1,
    };
    return { ...f, row, payment, result };
  }
  it('holds inflight capture while objected and refunds original MoMo when objection cancels liability', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const open = await recovery.object(f.buyer.id, f.row.id, {
      requestId: randomUUID(),
      reason: 'Decision amount is incorrect',
      evidence: 'Original document supports full refund',
    });
    await payments.ipn(f.result as never);
    await payments.ipn(f.result as never);
    const held = await recovery.find(f.buyer.id, f.row.id);
    expect(held.reserved).toBe(40000);
    expect(held.collected).toBe(0);
    await recovery.correct(f.admin.id, f.row.id, {
      requestId: randomUUID(),
      expectedVersion: open.version,
      authorizedAmount: 100000,
      reason: 'Accepted full objection',
      evidence: 'Original document verified',
    });
    await payments.run();
    const capture = await db
      .getRepository(ExcessCapture)
      .findOneByOrFail({ paymentId: f.payment.id });
    expect(capture.reservations).toEqual([]);
    const refund = await db
      .getRepository(ExcessProviderRefund)
      .findOneByOrFail({ captureId: capture.id });
    expect(refund.amount).toBe(40000);
    expect(refund.state).toBe('SUCCEEDED');
    expect((await recovery.find(f.buyer.id, f.row.id)).reserved).toBe(0);
  });
  it('refunds capture exceeding liability after a new refund offset, without collecting twice', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const other = await adjudicationFixture(db);
    const source = await db.getRepository(WalletCredit).save({
      userId: f.buyer.id,
      orderId: other.order.id,
      mode: 'SIMULATION',
      amount: 25000,
    });
    await db
      .getRepository(WalletAccount)
      .update({ userId: f.buyer.id }, { simulationBalance: 25000 });
    await db.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(782143,1)');
      await offsetExcessRefund(m, 'CANCELLATION', source.id);
      await offsetExcessRefund(m, 'CANCELLATION', source.id);
    });
    await payments.ipn(f.result as never);
    const current = await recovery.find(f.buyer.id, f.row.id);
    expect(current.collected).toBe(40000);
    expect(current.outstanding).toBe(0);
    const capture = await db
      .getRepository(ExcessCapture)
      .findOneByOrFail({ paymentId: f.payment.id });
    expect(
      (
        await db
          .getRepository(ExcessProviderRefund)
          .findOneByOrFail({ captureId: capture.id })
      ).amount,
    ).toBe(25000);
    await expect(
      payments.create(other.buyer.id, {
        requestId: randomUUID(),
        excessIds: [f.row.id],
        amount: 40000,
      }),
    ).rejects.toThrow('not found');
    expect(
      (
        await db
          .getRepository(ExcessPayment)
          .findOneByOrFail({ id: f.payment.id })
      ).state,
    ).toBe('SUCCEEDED');
    expect(await db.getRepository(WalletExcess).countBy({ id: f.row.id })).toBe(
      1,
    );
  });
  it('returns a corrected MoMo collection to MoMo and excludes completed refunds from Admin queue', async () => {
    const f = await fixture();
    const db = database.dataSource;
    await payments.ipn(f.result as never);
    const open = await recovery.object(f.buyer.id, f.row.id, {
      requestId: randomUUID(),
      reason: 'Payment was not owed',
      evidence: 'Original full refund decision',
    });
    await recovery.correct(f.admin.id, f.row.id, {
      requestId: randomUUID(),
      expectedVersion: open.version,
      authorizedAmount: 100000,
      reason: 'Recovery canceled after review',
      evidence: 'Original decision verified',
    });
    const returns = await db
      .getRepository(ExcessReturn)
      .findBy({ excessId: f.row.id });
    expect(returns[0].method).toBe('MOMO');
    await payments.run();
    expect(
      (
        await db
          .getRepository(ExcessReturn)
          .findOneByOrFail({ id: returns[0].id })
      ).state,
    ).toBe('SUCCEEDED');
    expect(
      (
        await db
          .getRepository(WalletAccount)
          .findOneByOrFail({ userId: f.buyer.id })
      ).simulationBalance,
    ).toBe(0);
    const ops = new ExcessOperationsService(db);
    const queue = await ops.refundQueue(f.admin.id);
    expect(queue.every((r) => r.state !== 'SUCCEEDED')).toBe(true);
    const prior = f.result.transId;
    await payments.ipn({ ...f.result, transId: prior + 1 } as never);
    const duplicates = await db
      .getRepository(ExcessCapture)
      .findBy({ paymentId: f.payment.id });
    expect(duplicates).toHaveLength(2);
    expect((await recovery.find(f.buyer.id, f.row.id)).collected).toBe(40000);
  });
  it('preserves unknown refunds without resubmission and alerts after the pending threshold', async () => {
    const f = await fixture();
    const db = database.dataSource;
    await payments.ipn({ ...f.result, amount: 41000 } as never);
    const capture = await db
      .getRepository(ExcessCapture)
      .findOneByOrFail({ paymentId: f.payment.id });
    const refund = await db
      .getRepository(ExcessProviderRefund)
      .findOneByOrFail({ captureId: capture.id });
    expect(refund.amount).toBe(41000);
    const client = {
      refund: jest.fn(async () => {
        throw new Error('HTTP timeout');
      }),
      queryRefund: jest.fn(async () => false),
    };
    const refunds = new ExcessRefundService(
      db,
      client as unknown as MomoSandboxClient,
    );
    await refunds.refund(refund.id);
    await db.getRepository(ExcessProviderRefund).update(
      { id: refund.id },
      {
        nextQueryAt: new Date(0),
        createdAt: new Date(Date.now() - 31 * 60000),
      },
    );
    await refunds.refund(refund.id);
    expect(client.refund).toHaveBeenCalledTimes(1);
    expect(client.queryRefund).toHaveBeenCalledTimes(1);
    const pending = await db
      .getRepository(ExcessProviderRefund)
      .findOneByOrFail({ id: refund.id });
    expect(pending.state).toBe('UNKNOWN');
    expect(pending.alertedAt).toBeInstanceOf(Date);
    expect(pending.responseDueAt).toBeInstanceOf(Date);
  });
});
