import { randomUUID } from 'node:crypto';

import { AuthProvider } from '@/modules/auth/enums';
import { Order } from '@/modules/order/entities';
import { FulfillmentCalendar } from '@/modules/shipment/entities';
import { fulfillmentDeadline } from '@/modules/shipment/utils/fulfillment-calendar';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';
import { ShopSettlement } from '@/modules/shop-finance/entities/shop-settlement.entity';
import { readPayoutSources } from '@/modules/shop-finance/payout-sources';
import {
  ShopPayout,
  ShopPayoutAllocation,
  ShopPayoutEvent,
} from '@/modules/shop-finance/payouts/entities';
import { payoutOwnerViewSchema } from '@/modules/shop-finance/payouts/schemas/payout.schema';
import { ShopPayoutService } from '@/modules/shop-finance/payouts/shop-payout.service';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { createTestDatabase, TestDatabase } from '../support/database';

describe('manual evidenced shop payouts (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: ShopPayoutService;
  const admin = randomUUID();
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new ShopPayoutService(database.dataSource);
    await database.dataSource.getRepository(User).save({
      id: admin,
      email: randomUUID() + '@test.local',
      fullName: 'Admin',
      provider: AuthProvider.CREDENTIALS,
      status: UserStatus.ACTIVE,
      role: UserRole.ADMIN,
    });
  });
  afterAll(async () => database?.destroy());
  async function fixture() {
    const db = database.dataSource;
    const owner = await db.getRepository(User).save({
      email: randomUUID() + '@test.local',
      fullName: 'Owner',
      provider: AuthProvider.CREDENTIALS,
      status: UserStatus.ACTIVE,
    });
    const shop = await db.getRepository(Shop).save({ name: 'Payout shop' });
    await db.getRepository(ShopMember).save({
      shopId: shop.id,
      userId: owner.id,
      memberRole: ShopMemberRole.OWNER,
    });
    for (const mode of ['EVIDENCE', 'SIMULATION'] as const) {
      const order = await db.getRepository(Order).save({
        checkoutOrderId: randomUUID(),
        buyerId: owner.id,
        shopId: shop.id,
        shopName: shop.name,
        paymentMethod: 'COD',
        status: 'delivered',
        subtotal: 1000,
        shippingFee: 0,
        total: 1000,
        commissionBasisPoints: 0,
        sellerConfirmBy: new Date(),
        address: {},
        items: [],
      });
      const credit = await db.getRepository(ShopLedgerEntry).save({
        shopId: shop.id,
        orderId: order.id,
        mode,
        type: 'COD_FUNDED_HELD',
        amount: 1000,
      });
      await db.getRepository(ShopSettlement).save({
        shopId: shop.id,
        orderId: order.id,
        creditId: credit.id,
        mode,
        amount: 1000,
      });
    }
    const bank = await service.saveBank(owner.id, shop.id, {
      bankCode: 'VCB',
      accountNumber: '12345678',
      accountName: 'Other recipient',
      ownerConfirmed: true,
      isDefault: true,
    });
    const input = {
      requestId: randomUUID(),
      mode: 'EVIDENCE' as const,
      amount: 600,
      bankAccountId: bank.id,
    };
    return { db, owner, shop, bank, input };
  }
  function proof(payout: ShopPayout, reference = randomUUID()) {
    return {
      ...payout.recipientSnapshot,
      amount: payout.amount,
      bankReference: reference,
      transferredAt: new Date(Date.now() - 1000).toISOString(),
      evidence: 'bank receipt confirms successful transfer',
    };
  }
  it('atomically permits one active request across modes, reserves exact sources and snapshots recipient', async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      service.request(f.owner.id, f.shop.id, f.input),
      service.request(f.owner.id, f.shop.id, {
        ...f.input,
        requestId: randomUUID(),
        mode: 'SIMULATION',
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const payout = (
      results.find(
        (r) => r.status === 'fulfilled',
      ) as PromiseFulfilledResult<ShopPayout>
    ).value;
    const allocation = await f.db
      .getRepository(ShopPayoutAllocation)
      .findBy({ payoutId: payout.id });
    expect(allocation.map((a) => a.mode)).toEqual([payout.mode]);
    expect(allocation.reduce((sum, a) => sum + a.amount, 0)).toBe(600);
    await service.saveBank(
      f.owner.id,
      f.shop.id,
      {
        bankCode: 'ACB',
        accountNumber: '98765432',
        accountName: 'Changed name',
        ownerConfirmed: true,
        isDefault: true,
      },
      f.bank.id,
    );
    expect(
      (await f.db.getRepository(ShopPayout).findOneByOrFail({ id: payout.id }))
        .recipientSnapshot.accountNumber,
    ).toBe('12345678');
    await service.cancel(f.owner.id, f.shop.id, payout.id);
    const funds = await readPayoutSources(f.db.manager, f.shop.id, payout.mode);
    expect(funds.available).toBe(1000);
    expect(funds.payoutLocked).toBe(0);
  });
  it('keeps unknown funds locked, releases only verified failure and never retries nonreceipt', async () => {
    const f = await fixture();
    await service.setShopRisk(admin, f.shop.id, {
      evidence: 'Owner identity incident',
      riskReason: 'Impersonation investigation',
    });
    await expect(
      service.request(f.owner.id, f.shop.id, f.input),
    ).rejects.toThrow('risk review');
    await service.setShopRisk(admin, f.shop.id, {
      evidence: 'Authorized recipient identity independently checked',
      riskReason: null,
    });
    const payout = await service.request(f.owner.id, f.shop.id, f.input);
    await expect(
      service.start(f.owner.id, payout.id, 'Unauthorized'),
    ).rejects.toThrow('Active Admin required');
    await service.start(
      admin,
      payout.id,
      'Recipient manually checked against snapshot',
    );
    await expect(
      service.cancel(f.owner.id, f.shop.id, payout.id),
    ).rejects.toThrow('Only pending payouts');
    await service.unknown(admin, payout.id, 'Bank timeout');
    expect(
      (await readPayoutSources(f.db.manager, f.shop.id, 'EVIDENCE'))
        .payoutLocked,
    ).toBe(600);
    await expect(
      service.fail(admin, payout.id, {
        reason: 'timeout',
        evidence: 'timeout',
        noDebit: false,
        noInflight: true,
      } as never),
    ).rejects.toThrow('Invalid input');
    await service.fail(admin, payout.id, {
      reason: 'Bank verified rejection',
      evidence: 'Bank trace confirms no debit and no inflight',
      noDebit: true,
      noInflight: true,
    });
    expect(
      (await readPayoutSources(f.db.manager, f.shop.id, 'EVIDENCE')).available,
    ).toBe(1000);
    const next = await service.request(f.owner.id, f.shop.id, {
      ...f.input,
      requestId: randomUUID(),
    });
    await service.start(admin, next.id, 'Recipient confirmed');
    await expect(
      service.succeed(admin, next.id, { ...proof(next), amount: 599 }),
    ).rejects.toThrow('Bank evidence');
    await expect(
      service.succeed(admin, next.id, {
        ...proof(next),
        accountNumber: '999999',
      }),
    ).rejects.toThrow('Bank evidence');
    const evidence = proof(next);
    await service.succeed(admin, next.id, evidence);
    await service.succeed(admin, next.id, evidence);
    expect(
      (await readPayoutSources(f.db.manager, f.shop.id, 'EVIDENCE')).paidOut,
    ).toBe(600);
    expect(
      await service.nonreceipt(
        f.owner.id,
        f.shop.id,
        next.id,
        'Owner reports no receipt',
      ),
    ).toEqual({ incidentRecorded: true, additionalTransfer: false });
    await service.operationalUpdate(
      admin,
      next.id,
      'Bank tracing nonreceipt',
      'Private bank trace supporting investigation',
    );
    const ownerView = payoutOwnerViewSchema.parse(
      await service.ownerView(f.owner.id, f.shop.id),
    );
    expect(
      ownerView.events.some((event) => event.type === 'OPERATIONS_UPDATE'),
    ).toBe(true);
    expect(
      ownerView.events.some((event) => event.type === 'OPERATIONS_EVIDENCE'),
    ).toBe(false);
    expect(JSON.stringify(ownerView)).not.toContain('Private bank trace');
    expect(
      await f.db
        .getRepository(ShopPayoutEvent)
        .countBy({ payoutId: next.id, type: 'SUCCEEDED' }),
    ).toBe(1);
  });
  it('blocks risk and source corrections before start but records proven actual bank success with incident', async () => {
    const f = await fixture();
    const payout = await service.request(f.owner.id, f.shop.id, f.input);
    await service.reviewBank(admin, f.bank.id, {
      evidence: 'Risk review',
      riskReason: 'Recipient is disputed',
    });
    await expect(
      service.start(admin, payout.id, 'manual check'),
    ).rejects.toThrow('risk review');
    await service.reviewBank(admin, f.bank.id, {
      evidence: 'Verified valid recipient',
      riskReason: null,
    });
    await service.start(admin, payout.id, 'Recipient checked');
    await service.reviewBank(admin, f.bank.id, {
      evidence: 'New adverse evidence',
      riskReason: 'Recipient risky',
    });
    await f.db
      .getRepository(ShopSettlement)
      .update({ shopId: f.shop.id, mode: 'EVIDENCE' }, { amount: 0 });
    await service.succeed(admin, payout.id, proof(payout));
    expect(
      await f.db
        .getRepository(ShopPayoutEvent)
        .countBy({ payoutId: payout.id, type: 'RECONCILIATION_INCIDENT' }),
    ).toBe(1);
    expect(
      (await readPayoutSources(f.db.manager, f.shop.id, 'EVIDENCE'))
        .paidOutDebt,
    ).toBe(600);
    await expect(service.ownerView(randomUUID(), f.shop.id)).rejects.toThrow(
      'Current active Shop Owner',
    );
  });
  it('recovers missing calendar from original creation and flags overdue without unlocking unknown money', async () => {
    const f = await fixture();
    await f.db.getRepository(FulfillmentCalendar).clear();
    const payout = await service.request(f.owner.id, f.shop.id, f.input);
    expect(payout.dueAt).toBeNull();
    await service.start(admin, payout.id, 'Recipient checked');
    await service.unknown(admin, payout.id, 'Pending bank trace');
    const original = new Date(Date.now() - 14 * 86400000);
    await f.db
      .getRepository(ShopPayout)
      .update({ id: payout.id }, { createdAt: original });
    const year = original.getUTCFullYear();
    for (const approvedYear of [year, year + 1])
      await f.db.getRepository(FulfillmentCalendar).save({
        year: approvedYear,
        closedDates: [],
        source: 'Approved calendar',
        approvedBy: admin,
      });
    await service.run();
    await service.run();
    const saved = await f.db
      .getRepository(ShopPayout)
      .findOneByOrFail({ id: payout.id });
    expect(saved.dueAt).toEqual(
      await fulfillmentDeadline(f.db.manager, original, 2),
    );
    expect(saved.overdueAt).not.toBeNull();
    expect(saved.followUpDueAt).not.toBeNull();
    expect(saved.status).toBe('UNKNOWN');
    expect(
      await f.db
        .getRepository(ShopPayoutEvent)
        .countBy({ payoutId: payout.id, type: 'OVERDUE_OWNER_NOTICE' }),
    ).toBe(1);
    expect(
      (await readPayoutSources(f.db.manager, f.shop.id, 'EVIDENCE'))
        .payoutLocked,
    ).toBe(600);
  });
});
