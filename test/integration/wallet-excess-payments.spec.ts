import { randomUUID } from 'node:crypto';

import { PayosClient } from '@/infrastructure/payment/payos.client';
import { WalletAccount, WalletCredit } from '@/modules/wallet/entities';
import {
  ExcessCapture,
  ExcessPayment,
  ExcessProviderRefund,
  WalletExcess,
} from '@/modules/wallet/excess/entities';
import { ExcessReturn } from '@/modules/wallet/excess/entities';
import { ExcessOperationsService } from '@/modules/wallet/excess/excess-operations.service';
import { ExcessAttemptService } from '@/modules/wallet/excess/payments/excess-attempt.service';
import { ExcessPaymentService } from '@/modules/wallet/excess/payments/excess-payment.service';
import { ExcessRefundService } from '@/modules/wallet/excess/payments/excess-refund.service';
import { offsetExcessRefund } from '@/modules/wallet/excess/policies/excess-accounting.policy';
import { WalletExcessService } from '@/modules/wallet/excess/wallet-excess.service';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';

describe('Wallet recovery PayOS (PostgreSQL)', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let recovery: WalletExcessService;
  let payments: ExcessPaymentService;
  const gateway = {
    createPaymentLink: jest.fn(async (input) => ({
      orderCode: input.orderCode,
      paymentLinkId: 'plink-1',
      status: 'PENDING',
      checkoutUrl: 'https://pay.payos.vn/web/plink-1',
      qrCode: 'qr',
    })),
    verifyWebhook: jest.fn(async (x) => x),
    getPaymentLink: jest.fn(),
  };
  beforeAll(async () => {
    database = await createTestDatabase();
    recovery = new WalletExcessService(database.dataSource);
    payments = new ExcessPaymentService(
      database.dataSource,
      gateway as unknown as PayosClient,
      new ExcessAttemptService(
        database.dataSource,
        gateway as unknown as PayosClient,
      ),
      new ExcessRefundService(
        database.dataSource,
        gateway as unknown as PayosClient,
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
    const saved = await db
      .getRepository(ExcessPayment)
      .findOneByOrFail({ id: payment.id });
    const result = {
      orderCode: Number(saved.providerOrderCode),
      amount: 40000,
      code: '00',
      desc: 'success',
      reference: `FT${Math.floor(Math.random() * 1000000000) + 1}`,
      paymentLinkId: 'plink-1',
      description: 'RW REC ' + payment.id.slice(0, 8),
      isTestPing: false,
    };
    return { ...f, row, payment, result };
  }
  it('holds inflight capture while objected and escalates refund when objection cancels liability', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const open = await recovery.object(f.buyer.id, f.row.id, {
      requestId: randomUUID(),
      reason: 'Decision amount is incorrect',
      evidence: 'Original document supports full refund',
    });
    await payments.webhook(f.result);
    await payments.webhook(f.result);
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
    expect(refund.state).toBe('REVIEW');
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
      await offsetExcessRefund(m, 'CANCELLATION', source.id);
      await offsetExcessRefund(m, 'CANCELLATION', source.id);
    });
    await payments.webhook(f.result);
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
  it('marks a corrected PayOS collection return as PAYOS and escalates refund for operational review', async () => {
    const f = await fixture();
    const db = database.dataSource;
    await payments.webhook(f.result);
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
    expect(returns[0].method).toBe('PAYOS');
    await payments.run();
    const ops = new ExcessOperationsService(db);
    const queue = await ops.refundQueue(f.admin.id);
    expect(queue.every((r) => r.state !== 'SUCCEEDED')).toBe(true);
    await payments.webhook({
      ...f.result,
      reference: f.result.reference + '_DUP',
    });
    const duplicates = await db
      .getRepository(ExcessCapture)
      .findBy({ paymentId: f.payment.id });
    expect(duplicates).toHaveLength(2);
    expect((await recovery.find(f.buyer.id, f.row.id)).collected).toBe(40000);
  });
  it('escalates excess refunds to REVIEW once and alerts admin immediately', async () => {
    const f = await fixture();
    const db = database.dataSource;
    await payments.webhook({ ...f.result, amount: 41000 });
    const capture = await db
      .getRepository(ExcessCapture)
      .findOneByOrFail({ paymentId: f.payment.id });
    const refund = await db
      .getRepository(ExcessProviderRefund)
      .findOneByOrFail({ captureId: capture.id });
    expect(refund.amount).toBe(41000);
    const refunds = new ExcessRefundService(
      db,
      gateway as unknown as PayosClient,
    );
    await refunds.refund(refund.id);
    const pending = await db
      .getRepository(ExcessProviderRefund)
      .findOneByOrFail({ id: refund.id });
    expect(pending.state).toBe('REVIEW');
    expect(pending.alertedAt).toBeInstanceOf(Date);
    expect(pending.responseDueAt).toBeInstanceOf(Date);
  });
});
