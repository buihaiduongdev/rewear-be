import type { DataSource } from 'typeorm';

import type {
  MomoNotification,
  MomoSandboxClient,
} from '@/infrastructure/payment/momo-sandbox.client';
import { allocateFeeCapture } from '@/modules/fees/payments/fee-payment.policy';
import { hasOverlappingFeeAttempt } from '@/modules/fees/payments/fee-payment.policy';
import { feeRefundPublicView } from '@/modules/fees/payments/fee-payment.policy';
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

describe('fee IPN merchant references', () => {
  const db = { transaction: jest.fn() };
  const gateway = { verifyIpn: jest.fn() };
  const service = new FeePaymentService(
    db as unknown as DataSource,
    gateway as unknown as MomoSandboxClient,
  );
  beforeEach(() => jest.resetAllMocks());
  it('rejects invalid signatures as unauthorized before database work', async () => {
    gateway.verifyIpn.mockImplementation(() => {
      throw new Error('secret-bearing transport detail');
    });
    await expect(service.ipn({} as MomoNotification)).rejects.toMatchObject({
      status: 401,
      message: 'Invalid fee payment signature',
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it.each([
    {
      orderId: 'a',
      requestId: 'b',
      orderInfo: 'Rewear fee a',
      orderType: 'momo_wallet',
    },
    {
      orderId: 'a',
      requestId: 'a',
      orderInfo: 'Checkout a',
      orderType: 'momo_wallet',
    },
    {
      orderId: 'a',
      requestId: 'a',
      orderInfo: 'Rewear fee a',
      orderType: 'other',
    },
  ])('rejects a signed foreign merchant reference %#', async (reference) => {
    gateway.verifyIpn.mockReturnValue(reference);
    await expect(
      service.ipn(reference as MomoNotification),
    ).rejects.toMatchObject({ status: 401 });
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
