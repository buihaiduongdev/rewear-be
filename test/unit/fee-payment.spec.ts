import type { DataSource } from 'typeorm';

import type {
  PayosClient,
  PayosWebhookResult,
} from '@/infrastructure/payment/payos.client';
import {
  allocateFeeCapture,
  feeRefundPublicView,
  hasOverlappingFeeAttempt,
} from '@/modules/fees/payments/fee-payment.policy';
import { FeePaymentService } from '@/modules/fees/payments/fee-payment.service';

describe('fee capture allocation', () => {
  it('refunds everything when a signed capture amount differs from the target', () => {
    expect(allocateFeeCapture(2000, 3000, [2000])).toEqual({
      allocations: [0],
      refund: 3000,
    });
  });
  it('refunds exact excess after another collection wins', () => {
    expect(allocateFeeCapture(5000, 5000, [1000, 2000])).toEqual({
      allocations: [1000, 2000],
      refund: 2000,
    });
  });
});

it('blocks any unknown overlapping target regardless of who started it', () => {
  expect(
    hasOverlappingFeeAttempt(
      [{ state: 'UNKNOWN', targets: [{ feeId: 'a' }] }],
      ['a'],
    ),
  ).toBe(true);
  expect(
    hasOverlappingFeeAttempt(
      [{ state: 'FAILED', targets: [{ feeId: 'a' }] }],
      ['a'],
    ),
  ).toBe(false);
  expect(
    hasOverlappingFeeAttempt(
      [{ state: 'PENDING', targets: [{ feeId: 'b' }] }],
      ['a'],
    ),
  ).toBe(false);
});

describe('fee PayOS webhook merchant references', () => {
  const db = {
    transaction: jest.fn(),
    getRepository: jest.fn(() => ({ findOneBy: jest.fn(async () => null) })),
  };
  const gateway = { verifyWebhook: jest.fn() };
  const service = new FeePaymentService(
    db as unknown as DataSource,
    gateway as unknown as PayosClient,
  );
  beforeEach(() => jest.clearAllMocks());

  it('rejects invalid signatures as unauthorized before database work', async () => {
    gateway.verifyWebhook.mockRejectedValue(
      new Error('secret-bearing transport detail'),
    );
    await expect(service.webhook({})).rejects.toMatchObject({
      status: 401,
      message: 'Invalid fee payment signature',
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('ignores test ping webhooks cleanly without hitting fee records', async () => {
    gateway.verifyWebhook.mockResolvedValue({
      orderCode: 123,
      amount: 2000,
      code: '00',
      desc: 'success',
      reference: 'TF2302042130',
      paymentLinkId: 'plink',
      description: 'Ma giao dich thu nghiem',
      isTestPing: true,
    } satisfies PayosWebhookResult);
    await expect(service.webhook({})).resolves.toBeUndefined();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects unknown merchant orderCode references cleanly', async () => {
    gateway.verifyWebhook.mockResolvedValue({
      orderCode: 999999,
      amount: 5000,
      code: '00',
      desc: 'success',
      reference: 'FT24001',
      paymentLinkId: 'plink',
      description: 'RW FEE TEST',
      isTestPing: false,
    } satisfies PayosWebhookResult);
    await expect(service.webhook({})).rejects.toMatchObject({
      status: 401,
      message: 'Invalid fee payment reference',
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

it('shows pending refunds without exposing their provider source or private history', () => {
  const source = {
    id: 'refund',
    amount: 5000,
    state: 'UNKNOWN',
    alertedAt: null,
    responseDueAt: null,
    captureId: 'private',
    history: [{ state: 'private' }],
  };
  expect(feeRefundPublicView(source)).toEqual({
    id: 'refund',
    amount: 5000,
    state: 'UNKNOWN',
    alertedAt: null,
    responseDueAt: null,
  });
});
