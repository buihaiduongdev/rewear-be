import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';

import { createCheckoutSchema } from '@/modules/checkout/schemas/checkout.schema';
import {
  snapshotFeeDisclosure,
  verifyFeeDisclosure,
} from '@/modules/fees/disclosure/fee-disclosure';
import { feePolicyPublishSchema } from '@/modules/fees/disclosure/fee-disclosure.schema';
import { FeeDisclosureService } from '@/modules/fees/disclosure/fee-disclosure.service';

describe('Fee disclosure consent input', () => {
  const base = {
    requestId: '11111111-1111-4111-8111-111111111111',
    addressId: '22222222-2222-4222-8222-222222222222',
    productIds: ['33333333-3333-4333-8333-333333333333'],
  };
  it('requires explicit acceptance and policy together while preserving legacy checkout', () => {
    expect(createCheckoutSchema.safeParse(base).success).toBe(true);
    expect(
      createCheckoutSchema.safeParse({ ...base, feePolicyId: base.requestId })
        .success,
    ).toBe(false);
    expect(
      createCheckoutSchema.safeParse({ ...base, feeTermsAccepted: true })
        .success,
    ).toBe(false);
    expect(
      createCheckoutSchema.safeParse({
        ...base,
        feePolicyId: base.requestId,
        feeTermsAccepted: true,
      }).success,
    ).toBe(true);
  });
  it('requires actual fee condition text and rejects invented fee kinds', () => {
    expect(
      feePolicyPublishSchema.safeParse({
        conditions: [
          {
            kind: 'CANCELLATION',
            text: 'Actual invoiced carrier cancellation costs after verified fault.',
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      feePolicyPublishSchema.safeParse({
        conditions: [{ kind: 'PENALTY', text: 'Fee' }],
      }).success,
    ).toBe(false);
  });
});

describe('Fee disclosure snapshot invariants', () => {
  const policy = {
    id: '11111111-1111-4111-8111-111111111111',
    version: 1,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    conditions: [
      { kind: 'CANCELLATION', text: 'Actual verified invoice costs' },
    ],
  };
  const now = new Date('2026-01-02T00:00:00.000Z');
  const manager = {
    findOne: jest.fn(async () => policy),
    find: jest.fn(async () => []),
    findOneBy: jest.fn(async () => policy),
  } as unknown as EntityManager;
  it('rejects stale policy and never supplies implicit buyer acceptance', async () => {
    await expect(
      snapshotFeeDisclosure(
        manager,
        {
          feePolicyId: '22222222-2222-4222-8222-222222222222',
          feeTermsAccepted: true,
        },
        [],
        now,
      ),
    ).rejects.toThrow('current');
    expect(
      (await snapshotFeeDisclosure(manager, {}, [], now))?.buyerAcceptedAt,
    ).toBeNull();
  });
  it('rejects legacy and acceptance later than order creation', async () => {
    const snapshot = await snapshotFeeDisclosure(
      manager,
      { feePolicyId: policy.id, feeTermsAccepted: true },
      [],
      now,
    );
    expect(
      await verifyFeeDisclosure(
        manager,
        { feeDisclosure: null, shopId: 'shop', createdAt: now },
        'BUYER',
        'CANCELLATION',
      ),
    ).toBe(false);
    expect(
      await verifyFeeDisclosure(
        manager,
        {
          feeDisclosure: snapshot,
          shopId: 'shop',
          createdAt: new Date(now.getTime() - 1),
        },
        'BUYER',
        'CANCELLATION',
      ),
    ).toBe(false);
  });
});

describe('Fee policy service authorization', () => {
  const manager = {
    query: jest.fn(async () => []),
    findOneBy: jest.fn(async () => null),
  };
  const db = {
    transaction: async (action: (value: unknown) => unknown) => action(manager),
  } as unknown as DataSource;
  it('rejects a direct publish by a non-active admin', async () => {
    await expect(
      new FeeDisclosureService(db).publish('user', {
        conditions: [
          {
            kind: 'CANCELLATION',
            text: 'Actual verified invoice cancellation cost',
          },
        ],
      }),
    ).rejects.toThrow('Admin');
  });
  it('rejects direct invalid policy publication before persistence', async () => {
    const authorizedDb = {
      transaction: async (action: (value: unknown) => unknown) =>
        action({ ...manager, findOneBy: async () => ({ id: 'admin' }) }),
    } as unknown as DataSource;
    await expect(
      new FeeDisclosureService(authorizedDb).publish('admin', {
        conditions: [],
      }),
    ).rejects.toThrow('Too small');
  });
});
