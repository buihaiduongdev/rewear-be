import {
  PAYMENT_ATTEMPT_STATE,
  PAYMENT_PROVIDER,
  PAYMENT_REFUND_REASON,
  PAYMENT_REFUND_RESOLUTION,
  PAYMENT_REFUND_STATE,
} from '@/modules/payment/constants/payment.constant';
import { PaymentAttempt, PaymentRefund } from '@/modules/payment/entities';
import { PaymentService } from '@/modules/payment/payment.service';
import { PaymentWorker } from '@/modules/payment/payment.worker';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

function createDbFixture(options: {
  provider: 'MOMO' | 'PAYOS';
  refundState?: 'QUEUED' | 'REVIEW_REQUIRED' | 'COMPLETED';
  providerTransId?: string;
}) {
  const now = new Date('2026-11-26T10:00:00.000Z');
  const attempt: Partial<PaymentAttempt> = {
    id: '11111111-1111-4111-8111-111111111111',
    checkoutId: '22222222-2222-4222-8222-222222222222',
    buyerId: '33333333-3333-4333-8333-333333333333',
    provider: options.provider,
    amount: 230000,
    state: PAYMENT_ATTEMPT_STATE.REFUND_REQUIRED,
  };
  const refund: Partial<PaymentRefund> = {
    id: '44444444-4444-4444-8444-444444444444',
    paymentId: attempt.id,
    providerTransId: options.providerTransId ?? '400123456',
    amount: 230000,
    reason: PAYMENT_REFUND_REASON.LATE_OR_INVALID_CAPTURE,
    state: options.refundState ?? PAYMENT_REFUND_STATE.QUEUED,
    nextQueryAt: new Date(now.getTime() - 1000),
    alertedAt: null,
    resolutionMethod: null,
    resolutionNote: null,
    resolvedById: null,
    resolvedAt: null,
  };
  const admin: Partial<User> = {
    id: '99999999-9999-4999-8999-999999999999',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  };

  const manager = {
    query: jest.fn(async () => [{ now }]),
    findOne: jest.fn(
      async (entity: unknown, opts: { where: { id?: string } }) => {
        if (entity === PaymentRefund) {
          return opts.where.id === refund.id ? refund : null;
        }
        if (entity === PaymentAttempt) {
          return opts.where.id === attempt.id ? attempt : null;
        }
        return null;
      },
    ),
    findOneOrFail: jest.fn(async (entity: unknown) => {
      if (entity === PaymentAttempt) return attempt;
      if (entity === PaymentRefund) return refund;
      throw new Error('Not found');
    }),
    findOneBy: jest.fn(
      async (entity: unknown, where: Record<string, unknown>) => {
        if (entity === PaymentAttempt && where.id === attempt.id)
          return attempt;
        if (entity === User && where.id === admin.id) return admin;
        return null;
      },
    ),
    find: jest.fn(async (entity: unknown) => {
      if (entity === PaymentRefund) return [refund];
      if (entity === PaymentAttempt) return [attempt];
      return [];
    }),
    save: jest.fn(async (value: unknown) => value),
  };

  const db = {
    manager,
    transaction: jest.fn(async (fn: (mgr: typeof manager) => unknown) =>
      fn(manager),
    ),
  };

  return { db, manager, attempt, refund, admin };
}

describe('Late-payment refund worker & admin resolution', () => {
  it('completes MoMo late-payment refund directly when MoMo refund succeeds', async () => {
    const f = createDbFixture({ provider: PAYMENT_PROVIDER.MOMO });
    const momoClient = {
      refund: jest.fn().mockResolvedValue({
        succeeded: true,
        resultCode: 0,
        message: 'Refunded by MoMo',
      }),
    };
    const walletService = { creditLatePaymentRefund: jest.fn() };
    const worker = new PaymentWorker(
      f.db as never,
      {} as never,
      null,
      momoClient as never,
      walletService as never,
    );

    await worker.refund(f.refund.id!);

    expect(momoClient.refund).toHaveBeenCalledTimes(1);
    expect(walletService.creditLatePaymentRefund).not.toHaveBeenCalled();
    expect(f.refund.state).toBe(PAYMENT_REFUND_STATE.COMPLETED);
    expect(f.refund.resolutionMethod).toBe(
      PAYMENT_REFUND_RESOLUTION.MOMO_REFUND,
    );
    expect(f.attempt.state).toBe(PAYMENT_ATTEMPT_STATE.REFUNDED);
  });

  it('auto-credits buyer refund wallet when MoMo refund fails or payment is PayOS', async () => {
    const momoFail = createDbFixture({ provider: PAYMENT_PROVIDER.MOMO });
    const failingMomo = {
      refund: jest.fn().mockResolvedValue({
        succeeded: false,
        resultCode: 1080,
        message: 'Refund failed',
      }),
    };
    const walletCredit = jest.fn().mockResolvedValue({ id: 'credit-1' });
    const momoWorker = new PaymentWorker(
      momoFail.db as never,
      {} as never,
      null,
      failingMomo as never,
      { creditLatePaymentRefund: walletCredit } as never,
    );

    await momoWorker.refund(momoFail.refund.id!);
    expect(walletCredit).toHaveBeenCalledWith(
      momoFail.manager,
      expect.objectContaining({
        userId: momoFail.attempt.buyerId,
        paymentRefundId: momoFail.refund.id,
        amount: 230000,
      }),
    );
    expect(momoFail.refund.state).toBe(PAYMENT_REFUND_STATE.COMPLETED);
    expect(momoFail.refund.resolutionMethod).toBe(
      PAYMENT_REFUND_RESOLUTION.WALLET_CREDIT,
    );
    expect(momoFail.attempt.state).toBe(PAYMENT_ATTEMPT_STATE.REFUNDED);

    const payos = createDbFixture({
      provider: PAYMENT_PROVIDER.PAYOS,
      providerTransId: 'FT24001',
    });
    const payosWallet = jest.fn().mockResolvedValue({ id: 'credit-2' });
    const payosWorker = new PaymentWorker(
      payos.db as never,
      {} as never,
      {} as never,
      null,
      { creditLatePaymentRefund: payosWallet } as never,
    );

    await payosWorker.refund(payos.refund.id!);
    expect(payosWallet).toHaveBeenCalledTimes(1);
    expect(payos.refund.state).toBe(PAYMENT_REFUND_STATE.COMPLETED);
    expect(payos.refund.resolutionMethod).toBe(
      PAYMENT_REFUND_RESOLUTION.WALLET_CREDIT,
    );
  });

  it('escalates to REVIEW_REQUIRED when auto wallet credit throws', async () => {
    const f = createDbFixture({
      provider: PAYMENT_PROVIDER.PAYOS,
      providerTransId: 'FT24001',
    });
    const worker = new PaymentWorker(
      f.db as never,
      {} as never,
      {} as never,
      null,
      {
        creditLatePaymentRefund: jest
          .fn()
          .mockRejectedValue(new Error('Wallet cap exceeded')),
      } as never,
    );

    await worker.refund(f.refund.id!);
    expect(f.refund.state).toBe(PAYMENT_REFUND_STATE.REVIEW_REQUIRED);
    expect(f.refund.alertedAt).toBeInstanceOf(Date);
    expect(f.attempt.state).toBe(PAYMENT_ATTEMPT_STATE.REFUND_REQUIRED);
  });

  it('allows Admin to resolve REVIEW_REQUIRED refund via wallet credit or manual transfer', async () => {
    const fWallet = createDbFixture({
      provider: PAYMENT_PROVIDER.PAYOS,
      refundState: PAYMENT_REFUND_STATE.REVIEW_REQUIRED,
    });
    const creditLatePaymentRefund = jest.fn().mockResolvedValue({ id: 'c1' });
    const service = new PaymentService(
      fWallet.db as never,
      null,
      {} as never,
      {} as never,
      {} as never,
      null,
      { creditLatePaymentRefund } as never,
    );

    const resolvedWallet = await service.resolveRefund(
      fWallet.admin.id!,
      fWallet.refund.id!,
      { action: 'CREDIT_WALLET', note: 'Approved by ops' },
    );
    expect(creditLatePaymentRefund).toHaveBeenCalledTimes(1);
    expect(resolvedWallet.state).toBe(PAYMENT_REFUND_STATE.COMPLETED);
    expect(resolvedWallet.resolutionMethod).toBe(
      PAYMENT_REFUND_RESOLUTION.WALLET_CREDIT,
    );
    expect(fWallet.attempt.state).toBe(PAYMENT_ATTEMPT_STATE.REFUNDED);

    const fManual = createDbFixture({
      provider: PAYMENT_PROVIDER.PAYOS,
      refundState: PAYMENT_REFUND_STATE.REVIEW_REQUIRED,
    });
    const manualService = new PaymentService(
      fManual.db as never,
      null,
      {} as never,
      {} as never,
      {} as never,
    );
    const resolvedManual = await manualService.resolveRefund(
      fManual.admin.id!,
      fManual.refund.id!,
      {
        action: 'MANUAL_TRANSFER',
        bankReference: 'VCB-20261126-01',
        note: 'Transferred back to buyer bank',
      },
    );
    expect(resolvedManual.state).toBe(PAYMENT_REFUND_STATE.COMPLETED);
    expect(resolvedManual.resolutionMethod).toBe(
      PAYMENT_REFUND_RESOLUTION.MANUAL_TRANSFER,
    );
    expect(resolvedManual.resolutionNote).toContain('VCB-20261126-01');
    expect(fManual.attempt.state).toBe(PAYMENT_ATTEMPT_STATE.REFUNDED);

    await expect(
      manualService.resolveRefund('not-admin', fManual.refund.id!, {
        action: 'MANUAL_TRANSFER',
        bankReference: 'X',
      }),
    ).rejects.toThrow('Active Admin required');
  });
});
