import { randomUUID } from 'node:crypto';

import { DisputeIssue } from '@/modules/dispute/entities/dispute-issue.entity';
import {
  FeeAssessment,
  FeeCollection,
  FeeRefund,
} from '@/modules/fees/entities';
import { feeOutstanding } from '@/modules/fees/fee-accounting';
import { FeeService } from '@/modules/fees/fee.service';
import {
  FeeOffsetAllocation,
  FeeWalletDebit,
} from '@/modules/fees/settlement/entities';
import { assertFeeCodEligibility } from '@/modules/fees/settlement/fee-cod-gate';
import { settleShopFees } from '@/modules/fees/settlement/fee-offset';
import { feeMoneyLock } from '@/modules/fees/settlement/fee-settlement.access';
import { FeeSettlementService } from '@/modules/fees/settlement/fee-settlement.service';
import { FeeWalletService } from '@/modules/fees/settlement/fee-wallet.service';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';
import { ShopSettlement } from '@/modules/shop-finance/entities/shop-settlement.entity';
import {
  encumberedOrderSettlement,
  readPayoutSources,
} from '@/modules/shop-finance/payout-sources';
import { ShopBankAccount } from '@/modules/shop-finance/payouts/entities/shop-bank-account.entity';
import { ShopPayoutService } from '@/modules/shop-finance/payouts/shop-payout.service';
import { WalletAccount, WalletCredit } from '@/modules/wallet/entities';
import { verifiedWalletFunds } from '@/modules/wallet/verified-wallet-funds';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Source-safe fee settlement (PostgreSQL)', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => database?.destroy());
  async function fixture(
    party: 'BUYER' | 'SHOP' = 'BUYER',
    mode: 'EVIDENCE' | 'SIMULATION' = 'SIMULATION',
    amount = 5000,
  ) {
    const db = database.dataSource,
      f = await adjudicationFixture(db);
    await db
      .getRepository(DisputeIssue)
      .update(f.issue.id, { status: 'RESOLVED_NO_REFUND' });
    const fee = await db.getRepository(FeeAssessment).save(
      db.getRepository(FeeAssessment).create({
        orderId: f.order.id,
        shopId: f.shop.id,
        buyerId: f.buyer.id,
        party,
        mode,
        kind: 'CANCELLATION',
        sourceId: randomUUID(),
        waybillId: randomUUID(),
        invoiceReference: randomUUID(),
        invoiceLine: '1',
        amount,
        payableAmount: amount,
        status: 'ACTIVE',
        reason: 'Verified fee liability fixture',
        evidence: 'Verified actual carrier invoice fixture',
        disclosureVerifiedAt: new Date(),
        notifiedAt: new Date(),
        dueAt: new Date(Date.now() + 86400000),
        objectionUsed: false,
      }),
    );
    const core = new FeeService(db);
    return {
      ...f,
      db,
      fee,
      core,
      internal: new FeeSettlementService(db, core),
    };
  }
  async function fundWallet(
    f: Awaited<ReturnType<typeof fixture>>,
    amount = 20000,
  ) {
    const simulated = f.fee.mode === 'SIMULATION';
    await f.db.getRepository(WalletAccount).save({
      userId: f.buyer.id,
      balance: simulated ? 0 : amount,
      simulationBalance: simulated ? amount : 0,
    });
    await f.db.getRepository(WalletCredit).save({
      userId: f.buyer.id,
      orderId: f.order.id,
      mode: f.fee.mode,
      amount,
      reason: 'ORDER_CANCELLED',
    });
  }
  async function fundShop(
    f: Awaited<ReturnType<typeof fixture>>,
    amount = 10000,
  ) {
    const credit = await f.db.getRepository(ShopLedgerEntry).save({
      orderId: f.order.id,
      shopId: f.shop.id,
      mode: f.fee.mode,
      collectionId: null,
      type: 'COD_FUNDED_HELD',
      amount,
      actorId: null,
    });
    return f.db.getRepository(ShopSettlement).save({
      orderId: f.order.id,
      shopId: f.shop.id,
      creditId: credit.id,
      mode: f.fee.mode,
      amount,
      refundDebit: 0,
    });
  }
  it.each(['EVIDENCE', 'SIMULATION'] as const)(
    'pays full buyer fee once from %s wallet and refunds a correction into certified funds',
    async (mode) => {
      const f = await fixture('BUYER', mode);
      await fundWallet(f);
      const wallet = new FeeWalletService(f.db),
        request = { requestId: randomUUID(), expectedAmount: 5000 };
      await Promise.all([
        wallet.pay(f.buyer.id, f.fee.id, request),
        wallet.pay(f.buyer.id, f.fee.id, request),
      ]);
      expect(
        await f.db.getRepository(FeeWalletDebit).countBy({ feeId: f.fee.id }),
      ).toBe(1);
      expect(
        await verifiedWalletFunds(f.db.manager, f.buyer.id, mode),
      ).toMatchObject({ available: 15000, spendable: 15000 });
      await f.core.correct(f.admin.id, f.fee.id, {
        payableAmount: 2000,
        reason: 'Verified incorrect fee reduction',
        evidence: 'Corrected carrier invoice detail',
      });
      expect(
        (
          await f.db
            .getRepository(FeeRefund)
            .findOneByOrFail({ feeId: f.fee.id })
        ).state,
      ).toBe('PENDING');
      await f.internal.run();
      await f.internal.run();
      expect(await feeOutstanding(f.db.manager, f.fee.id)).toBe(0);
      expect(
        await verifiedWalletFunds(f.db.manager, f.buyer.id, mode),
      ).toMatchObject({ available: 18000, spendable: 18000 });
      expect(
        (
          await verifiedWalletFunds(
            f.db.manager,
            f.buyer.id,
            mode === 'SIMULATION' ? 'EVIDENCE' : 'SIMULATION',
          )
        ).spendable,
      ).toBe(0);
    },
  );
  it('pauses wallet collection during a grounded objection and removes only the resolved fee COD restriction', async () => {
    const f = await fixture();
    await fundWallet(f);
    await f.core.object(f.buyer.id, f.fee.id, {
      reason: 'Carrier invoice applies to another parcel',
      evidence: 'Original parcel reference supporting objection',
    });
    await expect(
      new FeeWalletService(f.db).pay(f.buyer.id, f.fee.id, {
        requestId: randomUUID(),
        expectedAmount: 5000,
      }),
    ).rejects.toThrow('not collectible');
    expect(
      await f.db.getRepository(FeeWalletDebit).countBy({ feeId: f.fee.id }),
    ).toBe(0);
    await f.core.correct(f.admin.id, f.fee.id, {
      payableAmount: 5000,
      reason: 'Original verified fee upheld',
      evidence: 'Matched carrier invoice and parcel',
    });
    await f.db
      .getRepository(FeeAssessment)
      .update(f.fee.id, { dueAt: new Date(Date.now() - 1000) });
    await expect(
      assertFeeCodEligibility(f.db.manager, f.buyer.id, [], new Date()),
    ).rejects.toThrow('new COD only');
    await f.core.correct(f.admin.id, f.fee.id, {
      payableAmount: 0,
      reason: 'Clear fee assignment error corrected',
      evidence: 'Final carrier statement establishes error',
    });
    await expect(
      assertFeeCodEligibility(f.db.manager, f.buyer.id, [], new Date()),
    ).resolves.toBeUndefined();
  });
  it('settles Shop fees before a new payout and attributes each outflow to its source', async () => {
    const f = await fixture('SHOP', 'EVIDENCE', 6000);
    await fundShop(f);
    const bank = await f.db.getRepository(ShopBankAccount).save({
      shopId: f.shop.id,
      bankCode: 'VCB',
      accountNumber: '12345678',
      accountName: 'Owner',
      confirmedBy: f.owner.id,
      confirmedAt: new Date(),
    });
    const payout = new ShopPayoutService(f.db);
    await Promise.all([
      payout.request(f.owner.id, f.shop.id, {
        requestId: randomUUID(),
        amount: 3500,
        mode: 'EVIDENCE',
        bankAccountId: bank.id,
      }),
      f.internal.run(),
    ]);
    expect(await feeOutstanding(f.db.manager, f.fee.id)).toBe(0);
    expect(
      await readPayoutSources(f.db.manager, f.shop.id, 'EVIDENCE'),
    ).toMatchObject({ available: 500, payoutLocked: 3500, feeDebited: 6000 });
    expect(
      await encumberedOrderSettlement(f.db.manager, f.order.id, 'EVIDENCE'),
    ).toBe(9500);
    expect(await f.db.getRepository(FeeOffsetAllocation).count()).toBe(1);
  });
  it('restores wrong Shop offsets to a separate available source even when the original order is reopened', async () => {
    const f = await fixture('SHOP', 'EVIDENCE', 6000);
    await fundShop(f);
    await f.internal.run();
    await f.db
      .getRepository(DisputeIssue)
      .update(f.issue.id, { status: 'ACTIVE' });
    await f.core.correct(f.admin.id, f.fee.id, {
      payableAmount: 0,
      reason: 'Verified fee collection was incorrect',
      evidence: 'Amended actual carrier statement',
    });
    await f.internal.run();
    const sources = await readPayoutSources(
      f.db.manager,
      f.shop.id,
      'EVIDENCE',
    );
    expect(sources).toMatchObject({
      available: 6000,
      reviewHeld: 4000,
      feeDebited: 6000,
    });
    expect(sources.sources).toEqual([
      expect.objectContaining({ kind: 'FEE_CORRECTION', amount: 6000 }),
    ]);
    expect(
      await f.db.getRepository(FeeCollection).countBy({ feeId: f.fee.id }),
    ).toBe(1);
  });
  it('offsets a tiny undated Shop fee without inventing an overdue restriction', async () => {
    const f = await fixture('SHOP', 'EVIDENCE', 500);
    await fundShop(f);
    await f.db.getRepository(FeeAssessment).update(f.fee.id, { dueAt: null });
    await f.db.transaction(async (m) => {
      const now = await feeMoneyLock(m);
      await settleShopFees(m, f.shop.id, 'EVIDENCE', now);
    });
    expect(await feeOutstanding(f.db.manager, f.fee.id)).toBe(0);
    expect(
      (await readPayoutSources(f.db.manager, f.shop.id, 'EVIDENCE')).available,
    ).toBe(9500);
    await expect(
      assertFeeCodEligibility(
        f.db.manager,
        randomUUID(),
        [f.shop.id],
        new Date(),
      ),
    ).resolves.toBeUndefined();
  });
  it('isolates one invalid internal refund so unrelated verified Shop fees can still settle', async () => {
    const broken = await fixture();
    const collection = await broken.db.getRepository(FeeCollection).save({
      feeId: broken.fee.id,
      mode: broken.fee.mode,
      method: 'WALLET',
      sourceId: randomUUID(),
      amount: 5000,
    });
    await broken.db.getRepository(FeeRefund).save({
      feeId: broken.fee.id,
      collectionId: collection.id,
      mode: broken.fee.mode,
      method: 'WALLET',
      sourceId: collection.sourceId,
      amount: 5000,
      state: 'PENDING',
      requestId: randomUUID(),
      requestedAt: new Date(),
      reason: 'Fault-injection missing wallet debit',
      evidence: 'Must remain pending and not affect other records',
    });
    const valid = await fixture('SHOP', 'EVIDENCE', 2500);
    await fundShop(valid);
    await expect(valid.internal.run()).resolves.toBeDefined();
    expect(await feeOutstanding(valid.db.manager, valid.fee.id)).toBe(0);
    expect(
      (
        await broken.db
          .getRepository(FeeRefund)
          .findOneByOrFail({ feeId: broken.fee.id })
      ).state,
    ).toBe('PENDING');
  });
  it('does not start a Shop overdue clock when an upheld tiny fee still has no payable group', async () => {
    const f = await fixture('SHOP', 'SIMULATION', 500);
    await f.db.getRepository(FeeAssessment).update(f.fee.id, { dueAt: null });
    await f.core.object(f.owner.id, f.fee.id, {
      reason: 'Specific carrier invoice objection',
      evidence: 'Original label amount supporting review',
    });
    const result = await f.core.correct(f.admin.id, f.fee.id, {
      payableAmount: 500,
      reason: 'Verified small fee remains payable',
      evidence: 'Matched exact original carrier invoice',
    });
    expect(result.dueAt).toBeNull();
    await expect(
      assertFeeCodEligibility(
        f.db.manager,
        randomUUID(),
        [f.shop.id],
        new Date(Date.now() + 8 * 86400000),
      ),
    ).resolves.toBeUndefined();
  });
  it('absorbs a corrected tiny Buyer balance that cannot be paid by either supported method', async () => {
    const f = await fixture('BUYER', 'SIMULATION', 5000);
    const result = await f.core.correct(f.admin.id, f.fee.id, {
      payableAmount: 500,
      reason: 'Verified original invoice was overestimated',
      evidence: 'Corrected carrier invoice shows only five hundred dong',
    });
    expect(result).toMatchObject({
      payableAmount: 0,
      outstanding: 0,
      status: 'ABSORBED',
    });
    await expect(
      assertFeeCodEligibility(
        f.db.manager,
        f.buyer.id,
        [],
        new Date(Date.now() + 4 * 86400000),
      ),
    ).resolves.toBeUndefined();
  });
});
