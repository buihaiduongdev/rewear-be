import { randomUUID } from 'node:crypto';

import { UserFactory } from '@/database/factories/user.factory';
import { MomoSandboxClient } from '@/infrastructure/payment/momo-sandbox.client';
import {
  FeeAssessment,
  FeeCollection,
  FeeRefund,
} from '@/modules/fees/entities/fee.entity';
import {
  queueFeeCorrections,
  recordFeeCollection,
} from '@/modules/fees/fee-accounting';
import {
  FeePayment,
  FeePaymentCapture,
  FeeProviderRefund,
} from '@/modules/fees/payments/entities/fee-payment.entity';
import { FeePaymentService } from '@/modules/fees/payments/fee-payment.service';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { createTestDatabase, type TestDatabase } from '../support/database';

describe('separate MoMo fee payments (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: FeePaymentService;
  const client = {
    create: jest.fn(),
    query: jest.fn(),
    verifyIpn: jest.fn(),
    refund: jest.fn(),
    queryRefund: jest.fn(),
  };
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new FeePaymentService(
      database.dataSource,
      client as unknown as MomoSandboxClient,
    );
  });
  afterAll(async () => {
    await database?.destroy();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    client.verifyIpn.mockImplementation((value) => value);
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
    client.create.mockImplementation(async (input) => {
      expect(
        await db.getRepository(FeePayment).existsBy({ id: input.orderId }),
      ).toBe(true);
      return {
        ...input,
        partnerCode: 'TEST',
        resultCode: 0,
        transId: 0,
        payUrl: 'https://test-payment.momo.vn/pay',
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
  function notification(id: string, amount: number, transId = 12345) {
    return {
      orderId: id,
      requestId: id,
      amount,
      transId,
      resultCode: 0,
      orderInfo: 'Rewear fee ' + id,
      orderType: 'momo_wallet',
    } as never;
  }
  it('persists before HTTP and rejects changed replay targets', async () => {
    const { user, input } = await fixture();
    const payment = await service.create(user.id, input);
    expect((await service.create(user.id, input)).id).toBe(payment.id);
    expect(client.create).toHaveBeenCalledTimes(1);
    await expect(
      service.create(user.id, { ...input, amount: 4000 }),
    ).rejects.toThrow('Request id reused');
  });
  it('queries an ambiguous create without another create request', async () => {
    const { db, user, input } = await fixture();
    client.create.mockRejectedValue(new Error('timeout'));
    const payment = await service.create(user.id, input);
    await db
      .getRepository(FeePayment)
      .update(payment.id, { nextQueryAt: new Date(0) });
    client.query.mockResolvedValue({
      orderId: payment.id,
      requestId: payment.id,
      amount: 5000,
      transId: 12346,
      resultCode: 0,
    });
    await service.queryAttempt(payment.id);
    expect((await service.view(user.id, payment.id)).state).toBe('SUCCEEDED');
    expect(client.create).toHaveBeenCalledTimes(1);
  });
  it('allocates only remaining debt and confirms the original capture excess by query', async () => {
    const { db, user, fee, input } = await fixture();
    const payment = await service.create(user.id, input);
    await db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
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
    await service.ipn(notification(payment.id, 5000, 12347));
    await service.ipn(notification(payment.id, 5000, 12347));
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
    expect((await service.view(user.id, payment.id)).refunds).toEqual([
      expect.objectContaining({
        id: refund.id,
        amount: 3000,
        state: 'PENDING',
      }),
    ]);
    client.refund.mockResolvedValue({ resultCode: 0 });
    client.queryRefund.mockResolvedValue(false);
    await service.refund(refund.id);
    expect(
      (
        await db
          .getRepository(FeeProviderRefund)
          .findOneByOrFail({ id: refund.id })
      ).state,
    ).toBe('UNKNOWN');
    await db
      .getRepository(FeeProviderRefund)
      .update(refund.id, { nextQueryAt: new Date(0) });
    client.queryRefund.mockResolvedValue(true);
    await service.refund(refund.id);
    expect(client.refund).toHaveBeenCalledTimes(1);
    expect(
      (
        await db
          .getRepository(FeeProviderRefund)
          .findOneByOrFail({ id: refund.id })
      ).state,
    ).toBe('SUCCEEDED');
  });
  it('links a correction refund to its original capture and only confirms accounting after provider proof', async () => {
    const { db, user, fee, input } = await fixture();
    const payment = await service.create(user.id, input);
    await service.ipn(notification(payment.id, 5000, 12348));
    await db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const current = await manager.findOneByOrFail(FeeAssessment, {
        id: fee.id,
      });
      await queueFeeCorrections(manager, current, 3000, new Date());
    });
    client.refund.mockResolvedValue({ resultCode: 0 });
    client.queryRefund.mockResolvedValue(false);
    await service.runRefunds();
    const core = await db
      .getRepository(FeeRefund)
      .findOneByOrFail({ feeId: fee.id });
    expect(core.state).toBe('UNKNOWN');
    const provider = await db
      .getRepository(FeeProviderRefund)
      .findOneByOrFail({ feeRefundId: core.id });
    await db
      .getRepository(FeeProviderRefund)
      .update(provider.id, { nextQueryAt: new Date(0) });
    client.queryRefund.mockResolvedValue(true);
    await service.refund(provider.id);
    expect(
      (await db.getRepository(FeeRefund).findOneByOrFail({ id: core.id }))
        .state,
    ).toBe('SUCCEEDED');
  });
  it('rejects evidence-mode fees and foreign views', async () => {
    const { db, user, fee, input } = await fixture();
    await db.getRepository(FeeAssessment).update(fee.id, { mode: 'EVIDENCE' });
    await expect(service.create(user.id, input)).rejects.toThrow('Sandbox');
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
    await service.ipn(notification(payment.id, 6000, 12349));
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
    await service.ipn(notification(payment.id, 5000, 12350));
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
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
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
    await service.ipn(notification(payment.id, 5000, 12351));
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
    expect(client.refund).not.toHaveBeenCalled();
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
    expect(client.create).toHaveBeenCalledTimes(1);
  });
  it('keeps captured success immutable when create responds after its callback and later failure', async () => {
    const { user, input } = await fixture();
    client.create.mockImplementation(async (request) => {
      await service.ipn(notification(request.orderId, request.amount, 12352));
      return { ...request, resultCode: 1006 };
    });
    const payment = await service.create(user.id, input);
    expect(payment.state).toBe('SUCCEEDED');
    expect(payment.payUrl).toBeNull();
    await service.ipn({
      ...(notification(payment.id, 5000, 12352) as object),
      resultCode: 1006,
    } as never);
    expect((await service.view(user.id, payment.id)).state).toBe('SUCCEEDED');
  });
});
