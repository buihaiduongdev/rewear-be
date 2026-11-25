import { randomUUID } from 'node:crypto';

import { UserFactory } from '@/database/factories/user.factory';
import { PayosClient } from '@/infrastructure/payment/payos.client';
import {
  FeeAssessment,
  FeeCollection,
  FeeRefund,
} from '@/modules/fees/entities';
import {
  queueFeeCorrections,
  recordFeeCollection,
} from '@/modules/fees/fee-accounting';
import {
  FeePayment,
  FeePaymentCapture,
  FeeProviderRefund,
} from '@/modules/fees/payments/entities';
import { FeePaymentService } from '@/modules/fees/payments/fee-payment.service';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { createTestDatabase, type TestDatabase } from '../support/database';

describe('separate PayOS fee payments (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: FeePaymentService;
  const client = {
    createPaymentLink: jest.fn(),
    getPaymentLink: jest.fn(),
    verifyWebhook: jest.fn(),
  };
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new FeePaymentService(
      database.dataSource,
      client as unknown as PayosClient,
    );
  });
  afterAll(async () => {
    await database?.destroy();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    client.verifyWebhook.mockImplementation(async (value) => value);
  });
  async function fixture(amount = 5000) {
    const db = database.dataSource;
    const user = await db
      .getRepository(User)
      .save(new UserFactory().build({ status: UserStatus.ACTIVE }));
    const fee = await db.getRepository(FeeAssessment).save({
      orderId: randomUUID(),
      shopId: randomUUID(),
      buyerId: user.id,
      party: 'BUYER',
      mode: 'SIMULATION',
      kind: 'CANCELLATION',
      sourceId: randomUUID(),
      waybillId: 'TEST',
      invoiceReference: randomUUID(),
      invoiceLine: '1',
      amount,
      payableAmount: amount,
      status: 'ACTIVE',
      reason: 'Verified cost',
      evidence: 'Invoice',
      disclosureVerifiedAt: new Date(),
      notifiedAt: new Date(),
      dueAt: new Date(Date.now() + 86400000),
      objectionUsed: false,
    });
    client.createPaymentLink.mockImplementation(async (input) => {
      expect(
        await db
          .getRepository(FeePayment)
          .existsBy({ providerOrderCode: String(input.orderCode) }),
      ).toBe(true);
      return {
        orderCode: input.orderCode,
        paymentLinkId: 'plink-1',
        status: 'PENDING',
        checkoutUrl: 'https://pay.payos.vn/web/plink-1',
        qrCode: 'qr',
      };
    });
    const input = {
      requestId: randomUUID(),
      feeIds: [fee.id],
      amount,
      mode: 'SIMULATION' as const,
    };
    return { db, user, fee, input };
  }
  async function notification(id: string, amount: number, transId = 'FT12345') {
    const payment = await database.dataSource
      .getRepository(FeePayment)
      .findOneByOrFail({ id });
    return {
      orderCode: Number(payment.providerOrderCode),
      amount,
      code: '00',
      desc: 'success',
      reference: transId,
      paymentLinkId: 'plink-1',
      description: 'RW FEE ' + id.slice(0, 8),
      isTestPing: false,
    };
  }
  it('persists before HTTP and rejects changed replay targets', async () => {
    const { user, input } = await fixture();
    const payment = await service.create(user.id, input);
    expect((await service.create(user.id, input)).id).toBe(payment.id);
    expect(client.createPaymentLink).toHaveBeenCalledTimes(1);
    await expect(
      service.create(user.id, { ...input, amount: 4000 }),
    ).rejects.toThrow('Request id reused');
  });
  it('queries an ambiguous create without another create request', async () => {
    const { db, user, input } = await fixture();
    client.createPaymentLink.mockRejectedValue(new Error('timeout'));
    const payment = await service.create(user.id, input);
    const saved = await db
      .getRepository(FeePayment)
      .findOneByOrFail({ id: payment.id });
    await db
      .getRepository(FeePayment)
      .update(payment.id, { nextQueryAt: new Date(0) });
    client.getPaymentLink.mockResolvedValue({
      orderCode: Number(saved.providerOrderCode),
      status: 'PAID',
      amount: 5000,
      amountPaid: 5000,
      providerTransId: 'FT12346',
    });
    await service.queryAttempt(payment.id);
    expect((await service.view(user.id, payment.id)).state).toBe('SUCCEEDED');
    expect(client.createPaymentLink).toHaveBeenCalledTimes(1);
  });
  it('allocates only remaining debt and escalates original capture excess for manual review', async () => {
    const { db, user, fee, input } = await fixture();
    const payment = await service.create(user.id, input);
    await db.transaction(async (manager) => {
      await recordFeeCollection(
        manager,
        {
          feeId: fee.id,
          mode: 'SIMULATION',
          method: 'WALLET',
          sourceId: randomUUID(),
          amount: 3000,
        },
        new Date(),
      );
    });
    await service.webhook(await notification(payment.id, 5000, 'FT12347'));
    await service.webhook(await notification(payment.id, 5000, 'FT12347'));
    const capture = await db
      .getRepository(FeePaymentCapture)
      .findOneByOrFail({ paymentId: payment.id });
    expect(capture.allocatedAmount).toBe(2000);
    expect(
      await db.getRepository(FeeCollection).countBy({ sourceId: capture.id }),
    ).toBe(1);
    const refund = await db
      .getRepository(FeeProviderRefund)
      .findOneByOrFail({ captureId: capture.id });
    expect(refund.amount).toBe(3000);
    expect(refund.state).toBe('REVIEW');
    expect((await service.view(user.id, payment.id)).refunds).toEqual([
      expect.objectContaining({
        id: refund.id,
        amount: 3000,
        state: 'REVIEW',
      }),
    ]);
  });
  it('links a correction refund to its original capture and escalates for operational settlement', async () => {
    const { db, user, fee, input } = await fixture();
    const payment = await service.create(user.id, input);
    await service.webhook(await notification(payment.id, 5000, 'FT12348'));
    await db.transaction(async (manager) => {
      const current = await manager.findOneByOrFail(FeeAssessment, {
        id: fee.id,
      });
      await queueFeeCorrections(manager, current, 3000, new Date());
    });
    await service.runRefunds();
    const core = await db
      .getRepository(FeeRefund)
      .findOneByOrFail({ feeId: fee.id });
    expect(core.state).toBe('REVIEW');
    const provider = await db
      .getRepository(FeeProviderRefund)
      .findOneByOrFail({ feeRefundId: core.id });
    expect(provider.state).toBe('REVIEW');
  });
  it('rejects evidence-mode fees and foreign views', async () => {
    const { db, user, fee, input } = await fixture();
    await db.getRepository(FeeAssessment).update(fee.id, { mode: 'EVIDENCE' });
    await expect(service.create(user.id, input)).rejects.toThrow('PayOS');
    await db
      .getRepository(FeeAssessment)
      .update(fee.id, { mode: 'SIMULATION' });
    const payment = await service.create(user.id, input);
    const stranger = await db
      .getRepository(User)
      .save(new UserFactory().build({ status: UserStatus.ACTIVE }));
    await expect(service.view(stranger.id, payment.id)).rejects.toThrow(
      'Fee not found',
    );
  });
  it('refunds a wrong amount without discharging the fee', async () => {
    const { db, user, fee, input } = await fixture();
    const payment = await service.create(user.id, input);
    await service.webhook(await notification(payment.id, 6000, 'FT12349'));
    expect(
      await db.getRepository(FeeCollection).countBy({ feeId: fee.id }),
    ).toBe(0);
    const capture = await db
      .getRepository(FeePaymentCapture)
      .findOneByOrFail({ paymentId: payment.id });
    expect(
      (
        await db
          .getRepository(FeeProviderRefund)
          .findOneByOrFail({ captureId: capture.id })
      ).amount,
    ).toBe(6000);
  });
  it('returns a late contested capture to its source', async () => {
    const { db, user, fee, input } = await fixture();
    const payment = await service.create(user.id, input);
    await db.getRepository(FeeAssessment).update(fee.id, { status: 'REVIEW' });
    await service.webhook(await notification(payment.id, 5000, 'FT12350'));
    expect(
      await db.getRepository(FeeCollection).countBy({ feeId: fee.id }),
    ).toBe(0);
    const capture = await db
      .getRepository(FeePaymentCapture)
      .findOneByOrFail({ paymentId: payment.id });
    expect(
      (
        await db
          .getRepository(FeeProviderRefund)
          .findOneByOrFail({ captureId: capture.id })
      ).amount,
    ).toBe(5000);
  });
  it('preserves exact below-minimum excess for Admin review and keeps its original four-hour deadline', async () => {
    const { db, user, fee, input } = await fixture();
    const payment = await service.create(user.id, input);
    await db.transaction(async (manager) => {
      await recordFeeCollection(
        manager,
        {
          feeId: fee.id,
          mode: 'SIMULATION',
          method: 'WALLET',
          sourceId: randomUUID(),
          amount: 500,
        },
        new Date(),
      );
    });
    await service.webhook(await notification(payment.id, 5000, 'FT12351'));
    const capture = await db
      .getRepository(FeePaymentCapture)
      .findOneByOrFail({ paymentId: payment.id });
    const refund = await db
      .getRepository(FeeProviderRefund)
      .findOneByOrFail({ captureId: capture.id });
    expect(refund.state).toBe('REVIEW');
    expect(refund.amount).toBe(500);
    expect(refund.history[0].state).toBe('PROVIDER_REFUND_LIMIT');
    expect(refund.responseDueAt!.getTime() - refund.alertedAt!.getTime()).toBe(
      4 * 3600000,
    );
    await service.refund(refund.id);
    const admin = await db.getRepository(User).save(
      new UserFactory().build({
        status: UserStatus.ACTIVE,
        role: UserRole.ADMIN,
      }),
    );
    await expect(
      service.respondToRefund(user.id, refund.id, 'Attempted response'),
    ).rejects.toThrow('Unauthorized');
    const response = await service.respondToRefund(
      admin.id,
      refund.id,
      'Provider support contacted; exact source refund pending',
    );
    expect(response.responseDueAt).toEqual(refund.responseDueAt);
    expect(response.history.at(-1)!.state).toContain('ADMIN_RESPONSE');
  });

  it('permits only one provider create for concurrent distinct request IDs targeting one fee', async () => {
    const { user, input } = await fixture();
    const outcomes = await Promise.allSettled([
      service.create(user.id, input),
      service.create(user.id, { ...input, requestId: randomUUID() }),
    ]);
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(client.createPaymentLink).toHaveBeenCalledTimes(1);
  });
  it('keeps captured success immutable when create responds after its webhook and later cancellation', async () => {
    const { db, user, input } = await fixture();
    client.createPaymentLink.mockImplementation(async (request) => {
      const target = await db
        .getRepository(FeePayment)
        .findOneByOrFail({ providerOrderCode: String(request.orderCode) });
      await service.webhook(
        await notification(target.id, request.amount, 'FT12352'),
      );
      return {
        orderCode: request.orderCode,
        paymentLinkId: 'plink-1',
        status: 'CANCELLED',
        checkoutUrl: 'https://pay.payos.vn/web/plink-1',
        qrCode: 'qr',
      };
    });
    const payment = await service.create(user.id, input);
    expect(payment.state).toBe('SUCCEEDED');
    expect(payment.payUrl).toBeNull();
    expect((await service.view(user.id, payment.id)).state).toBe('SUCCEEDED');
  });
});
