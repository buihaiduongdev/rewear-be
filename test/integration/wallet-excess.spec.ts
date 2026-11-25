import { randomUUID } from 'node:crypto';

import { CheckoutFactory } from '@/database/factories/checkout.factory';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { Order } from '@/modules/order/entities';
import { FulfillmentCalendar } from '@/modules/shipment/entities';
import {
  WalletCheckoutHold,
  WalletDebit,
} from '@/modules/wallet/checkout/entities';
import { WalletAccount, WalletCredit } from '@/modules/wallet/entities';
import { ExcessAudit, WalletExcess } from '@/modules/wallet/excess/entities';
import { ExcessOperationsService } from '@/modules/wallet/excess/excess-operations.service';
import { offsetExcessRefund } from '@/modules/wallet/excess/policies/excess-accounting.policy';
import { WalletExcessService } from '@/modules/wallet/excess/wallet-excess.service';
import { verifiedWalletFunds } from '@/modules/wallet/verified-wallet-funds';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';

describe('Wallet excess recovery (PostgreSQL)', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let service: WalletExcessService;
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new WalletExcessService(database.dataSource);
  });
  afterAll(async () => database?.destroy());
  async function fixture() {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const credit = await db.getRepository(WalletCredit).save({
      userId: f.buyer.id,
      orderId: f.order.id,
      amount: 100000,
      mode: 'SIMULATION',
    });
    await db
      .getRepository(WalletAccount)
      .save({ userId: f.buyer.id, simulationBalance: 100000 });
    const input = {
      requestId: randomUUID(),
      sourceType: 'CANCELLATION' as const,
      sourceId: credit.id,
      authorizedAmount: 60000,
      reason: 'Verified original decision and credit ledger mismatch',
      evidence: 'Decision reference and verified ledger entry',
    };
    return { ...f, credit, input };
  }
  it('verifies a source once, debits only the excess, replays without double debit and keeps provenance', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const row = await service.verify(f.admin.id, f.input);
    expect(row.outstanding).toBe(0);
    expect(row.collected).toBe(40000);
    expect((await service.verify(f.admin.id, f.input)).id).toBe(row.id);
    expect(
      (
        await db
          .getRepository(WalletAccount)
          .findOneByOrFail({ userId: f.buyer.id })
      ).simulationBalance,
    ).toBe(60000);
    expect(
      (await verifiedWalletFunds(db.manager, f.buyer.id, 'SIMULATION'))
        .spendable,
    ).toBe(60000);
    await expect(
      service.verify(f.buyer.id, { ...f.input, requestId: randomUUID() }),
    ).rejects.toThrow('Forbidden');
    await expect(
      service.verify(f.admin.id, { ...f.input, requestId: randomUUID() }),
    ).rejects.toThrow('already assessed');
  });
  it('pauses recovery on objection and automatically returns an invalid wallet collection', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const row = await service.verify(f.admin.id, f.input);
    const objection = await service.object(f.buyer.id, row.id, {
      requestId: randomUUID(),
      reason: 'Original decision actually grants the full amount',
      evidence: 'Corrected decision document reference',
    });
    expect(objection.reviewState).toBe('OPEN');
    expect(objection.reviewDueAt).toBeInstanceOf(Date);
    const result = await service.correct(f.admin.id, row.id, {
      requestId: randomUUID(),
      expectedVersion: objection.version,
      authorizedAmount: 100000,
      reason: 'Accepted the objection based on original decision',
      evidence: 'Original decision verified',
    });
    expect(result.liability).toBe(0);
    expect(result.returned).toBe(40000);
    expect(
      (
        await db
          .getRepository(WalletAccount)
          .findOneByOrFail({ userId: f.buyer.id })
      ).simulationBalance,
    ).toBe(100000);
    expect(
      (await verifiedWalletFunds(db.manager, f.buyer.id, 'SIMULATION'))
        .spendable,
    ).toBe(100000);
    await expect(
      service.object(f.buyer.id, row.id, {
        requestId: randomUUID(),
        reason: 'Repeat objection',
        evidence: 'Same evidence',
      }),
    ).rejects.toThrow('objection unavailable');
  });
  async function newRefund(buyerId: string, amount: number) {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    await db.getRepository(Order).update({ id: f.order.id }, { buyerId });
    return db.getRepository(WalletCredit).save({
      userId: buyerId,
      orderId: f.order.id,
      amount,
      mode: 'SIMULATION',
    });
  }
  it('protects held money, skips objected debt and offsets a new refund once in verification order', async () => {
    const f = await fixture();
    const db = database.dataSource;
    await db
      .getRepository(WalletAccount)
      .update(
        { userId: f.buyer.id },
        { simulationBalance: 0, simulationHeldBalance: 100000 },
      );
    const first = await service.verify(f.admin.id, f.input);
    expect(first.outstanding).toBe(40000);
    const secondSource = await newRefund(f.buyer.id, 20000);
    const second = await service.verify(f.admin.id, {
      ...f.input,
      requestId: randomUUID(),
      sourceId: secondSource.id,
      authorizedAmount: 0,
    });
    const objection = await service.object(f.buyer.id, first.id, {
      requestId: randomUUID(),
      reason: 'Incorrect original decision',
      evidence: 'Original document reference',
    });
    const source = await newRefund(f.buyer.id, 30000);
    await db
      .getRepository(WalletAccount)
      .update({ userId: f.buyer.id }, { simulationBalance: 30000 });
    await db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143,1)');
      await offsetExcessRefund(manager, 'CANCELLATION', source.id);
      await offsetExcessRefund(manager, 'CANCELLATION', source.id);
    });
    expect((await service.find(f.buyer.id, first.id)).collected).toBe(0);
    expect((await service.find(f.buyer.id, second.id)).collected).toBe(20000);
    const account = await db
      .getRepository(WalletAccount)
      .findOneByOrFail({ userId: f.buyer.id });
    expect(account.simulationBalance).toBe(10000);
    expect(account.simulationHeldBalance).toBe(100000);
    const corrected = await service.correct(f.admin.id, first.id, {
      requestId: randomUUID(),
      expectedVersion: objection.version,
      authorizedAmount: 80000,
      reason: 'Partial objection accepted',
      evidence: 'Verified revised entitlement',
    });
    expect(corrected.outstanding).toBe(20000);
    // Resolving does not seize the 10k refund that arrived during review.
    expect(
      (
        await db
          .getRepository(WalletAccount)
          .findOneByOrFail({ userId: f.buyer.id })
      ).simulationBalance,
    ).toBe(10000);
  });
  it('keeps objection available without calendar, computes original deadline later and alerts once', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const ops = new ExcessOperationsService(db);
    const row = await service.verify(f.admin.id, f.input);
    await db.getRepository(FulfillmentCalendar).clear();
    const open = await service.object(f.buyer.id, row.id, {
      requestId: randomUUID(),
      reason: 'Disagree with verified amount',
      evidence: 'Specific ledger discrepancy',
    });
    expect(open.reviewDueAt).toBeNull();
    const past = new Date(Date.now() - 20 * 86400000);
    await db
      .getRepository(WalletExcess)
      .update({ id: row.id }, { objectedAt: past });
    await db.getRepository(FulfillmentCalendar).save({
      year: past.getUTCFullYear(),
      closedDates: [],
      approvedBy: f.admin.id,
      source: 'Approved test calendar',
    });
    await ops.run();
    await ops.run();
    const overdue = await service.find(f.buyer.id, row.id);
    expect(overdue.reviewOverdueAt).toBeInstanceOf(Date);
    expect(overdue.responseDueAt).toBeInstanceOf(Date);
    expect(overdue.reviewState).toBe('OPEN');
    expect(
      await db
        .getRepository(ExcessAudit)
        .countBy({ excessId: row.id, action: 'REVIEW_OVERDUE' }),
    ).toBe(1);
  });
  it('requires requested evidence, explicit withdrawal and current authority on command replay', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const ops = new ExcessOperationsService(db);
    const row = await service.verify(f.admin.id, f.input);
    await service.object(f.buyer.id, row.id, {
      requestId: randomUUID(),
      reason: 'Specific discrepancy',
      evidence: 'Original decision reference',
    });
    await expect(
      ops.supplement(f.buyer.id, row.id, {
        requestId: randomUUID(),
        reason: 'Additional details',
        evidence: 'Document reference',
      }),
    ).rejects.toThrow('No requested');
    await ops.requestEvidence(f.admin.id, row.id, {
      requestId: randomUUID(),
      message: 'Please provide the original decision reference',
    });
    await ops.supplement(f.buyer.id, row.id, {
      requestId: randomUUID(),
      reason: 'Requested document attached by reference',
      evidence: 'Original decision reference',
    });
    expect(() =>
      ops.withdraw(f.buyer.id, row.id, {
        requestId: randomUUID(),
        confirmed: false,
      } as never),
    ).toThrow('true');
    const input = { requestId: randomUUID(), confirmed: true as const };
    await ops.withdraw(f.buyer.id, row.id, input);
    await ops.withdraw(f.buyer.id, row.id, input);
    expect((await service.find(f.buyer.id, row.id)).reviewState).toBe('CLOSED');
    const other = await adjudicationFixture(db);
    await expect(service.find(other.buyer.id, row.id)).rejects.toThrow(
      'not found',
    );
  });
  it('resets escalation for an objection to a later corrected decision', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const row = await service.verify(f.admin.id, f.input);
    const open = await service.object(f.buyer.id, row.id, {
      requestId: randomUUID(),
      reason: 'First disputed decision',
      evidence: 'Specific original discrepancy',
    });
    await db
      .getRepository(WalletExcess)
      .update(
        { id: row.id },
        { reviewOverdueAt: new Date(), responseDueAt: new Date() },
      );
    const closed = await service.correct(f.admin.id, row.id, {
      requestId: randomUUID(),
      expectedVersion: open.version,
      authorizedAmount: 60000,
      reason: 'First review upheld',
      evidence: 'Verified decision reference',
    });
    const changed = await service.correct(f.admin.id, row.id, {
      requestId: randomUUID(),
      expectedVersion: closed.version,
      authorizedAmount: 50000,
      reason: 'New error found later',
      evidence: 'New specific verified discrepancy',
    });
    const next = await service.object(f.buyer.id, row.id, {
      requestId: randomUUID(),
      reason: 'Objection to the new decision',
      evidence: 'Specific new discrepancy',
    });
    expect(next.decisionVersion).toBe(changed.decisionVersion);
    expect(next.reviewOverdueAt).toBeNull();
    expect(next.responseDueAt).toBeNull();
    await expect(
      service.correct(f.admin.id, row.id, {
        requestId: randomUUID(),
        expectedVersion: closed.version,
        authorizedAmount: 60000,
        reason: 'Stale resolution',
        evidence: 'Existing document',
      }),
    ).rejects.toThrow('version changed');
  });
  it('records spent excess separately without negative balance or touching a purchased checkout', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const checkout = await db.getRepository(Checkout).save(
      new CheckoutFactory().build({
        buyerId: f.buyer.id,
        requestId: randomUUID(),
        addressId: randomUUID(),
        requestedProductIds: [],
        address: f.order.address,
        status: 'PAID',
        expiresAt: new Date(Date.now() + 600000),
      }),
    );
    const hold = await db.getRepository(WalletCheckoutHold).save({
      checkoutId: checkout.id,
      buyerId: f.buyer.id,
      requestId: randomUUID(),
      fingerprint: 'verified fixture purchase',
      mode: 'SIMULATION',
      state: 'CAPTURED',
      amount: 80000,
      orders: [],
      expiresAt: new Date(),
      capturedAt: new Date(),
      releasedAt: null,
    });
    await db.getRepository(WalletDebit).save({
      holdId: hold.id,
      checkoutId: checkout.id,
      buyerId: f.buyer.id,
      requestId: randomUUID(),
      mode: 'SIMULATION',
      amount: 80000,
    });
    await db
      .getRepository(WalletAccount)
      .update({ userId: f.buyer.id }, { simulationBalance: 20000 });
    const row = await service.verify(f.admin.id, f.input);
    expect(row.collected).toBe(20000);
    expect(row.outstanding).toBe(20000);
    const funds = await verifiedWalletFunds(
      db.manager,
      f.buyer.id,
      'SIMULATION',
    );
    expect(funds.spendable).toBe(0);
    expect(funds.backing).toBe(0);
    expect(
      (
        await db
          .getRepository(WalletCheckoutHold)
          .findOneByOrFail({ id: hold.id })
      ).state,
    ).toBe('CAPTURED');
  });
});
