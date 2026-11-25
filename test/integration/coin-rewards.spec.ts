import { randomUUID } from 'node:crypto';

import ms from 'ms';

import { CodReconciliationService } from '@/modules/cod-reconciliation/cod-reconciliation.service';
import { CoinService } from '@/modules/coins/core/coin.service';
import { CoinGrant, CoinOrderDebit } from '@/modules/coins/core/entities';
import { CoinRewardService } from '@/modules/coins/rewards/coin-reward.service';
import { CoinPurchaseReward } from '@/modules/coins/rewards/entities';
import { refundFunding } from '@/modules/dispute/dispute-refund-funding';
import { DisputeDecision } from '@/modules/dispute/entities/dispute-decision.entity';
import { DisputeIssue } from '@/modules/dispute/entities/dispute-issue.entity';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund-credit.entity';
import { Order } from '@/modules/order/entities';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { OrderFundingService } from '@/modules/order/order-funding.service';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Verified purchase coin rewards (PostgreSQL)', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => database?.destroy());
  async function fixture(
    mode: 'EVIDENCE' | 'SIMULATION' = 'EVIDENCE',
    discount = 0,
  ) {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    if (discount) {
      f.order.coinDiscount = discount;
      f.order.coinMode = mode;
      f.order.total -= discount;
      f.order.items = f.order.items.map((item) => ({
        ...item,
        coinDiscount: discount,
      }));
      await db.getRepository(Order).save(f.order);
      const coins = new CoinService();
      await db.transaction(async (manager) => {
        const now = new Date();
        const checkout = {
          id: randomUUID(),
          buyerId: f.buyer.id,
          expiresAt: new Date(now.getTime() + ms('10m')),
          subtotal: f.order.subtotal,
        };
        await coins.grantPurchaseReward(
          manager,
          f.buyer.id,
          randomUUID(),
          discount,
          mode,
          now,
        );
        await coins.reserveCheckoutCoins(
          manager,
          checkout,
          discount,
          mode,
          randomUUID(),
          now,
        );
        await coins.commitCodCoins(manager, checkout.id, [f.order], now);
      });
    }
    await db
      .getRepository(DisputeIssue)
      .update(f.issue.id, { status: 'RESOLVED_NO_REFUND' });
    const deliveredAt = new Date(Date.now() - ms('4d'));
    const disputeDeadlineAt = new Date(deliveredAt.getTime() + ms('72h'));
    await db.getRepository(Order).update(f.order.id, {
      status: 'completed',
      deliveryVerifiedAt: deliveredAt,
      disputeDeadlineAt,
    });
    await db.getRepository(OrderDeliveryVerification).save({
      orderId: f.order.id,
      deliveredAt,
      disputeDeadlineAt,
      mode,
      actorId: f.admin.id,
      reason: 'Verified delivery',
      evidence: 'signed proof',
    });
    const shipment = await db.getRepository(Shipment).save({
      orderId: f.order.id,
      state: 'BOOKED',
      orderCode: randomUUID(),
      payload: {},
      input: {} as Shipment['input'],
      quotedParcel: {} as Shipment['quotedParcel'],
      codAmount: f.order.total,
      providerStatus: 'delivered',
    });
    await new CodReconciliationService(db).recordCollection(
      f.admin.id,
      f.order.id,
      {
        requestId: randomUUID(),
        mode,
        waybillCode: shipment.orderCode!,
        collectedAmount: f.order.total,
        approvedCarrierFee: 0,
        collectedAt: deliveredAt.toISOString(),
        reason: 'Matched collection',
        evidence: 'Signed collection statement',
      },
    );
    return {
      ...f,
      db,
      deliveredAt,
      shipment,
      service: new CoinRewardService(db, new CoinService()),
    };
  }
  it('burns COD coins on collection and funds gross seller value using net cash plus proved subsidy', async () => {
    const f = await fixture('EVIDENCE', 10000);
    expect(await f.service.evaluate(f.order.id)).toMatchObject({
      entitlement: 450,
    });
    const finance = new CodReconciliationService(f.db);
    await finance.recordRemittance(f.admin.id, {
      requestId: randomUUID(),
      reference: randomUUID(),
      mode: 'EVIDENCE',
      netAmount: f.order.total,
      receivedAt: new Date().toISOString(),
      reason: 'Matched receipt',
      evidence: 'Bank receipt',
      allocations: [
        { orderId: f.order.id, cashAmount: f.order.total, feeDeducted: 0 },
      ],
    });
    const order = await f.db
      .getRepository(Order)
      .findOneByOrFail({ id: f.order.id });
    const funding = await f.db.transaction((manager) =>
      new OrderFundingService().heldCredit(manager, order, f.shipment),
    );
    expect(funding).toMatchObject({ amount: 97001, mode: 'EVIDENCE' });
    expect(
      await f.db.transaction((manager) =>
        refundFunding(manager, order, new Date()),
      ),
    ).toMatchObject({ itemFundsAvailable: 100001 });
    await f.db
      .getRepository(CoinOrderDebit)
      .update({ orderId: order.id }, { mode: 'SIMULATION' });
    expect(
      await f.db.transaction((manager) =>
        refundFunding(manager, order, new Date()),
      ),
    ).toBeNull();
    expect(
      await f.db.transaction((manager) =>
        new OrderFundingService().heldCredit(manager, order, f.shipment),
      ),
    ).toBeNull();
  });
  it('rewards once after verified72h without waiting COD remittance, including concurrent workers', async () => {
    const f = await fixture();
    await Promise.all([
      f.service.evaluate(f.order.id),
      f.service.evaluate(f.order.id),
    ]);
    const grant = await f.db
      .getRepository(CoinGrant)
      .findOneByOrFail({ sourceId: f.order.id, source: 'PURCHASE' });
    expect(grant).toMatchObject({
      amount: 500,
      mode: 'EVIDENCE',
      expiresAt: null,
    });
    expect(
      await f.db
        .getRepository(CoinPurchaseReward)
        .countBy({ orderId: f.order.id }),
    ).toBe(1);
  });
  it('keeps simulated grants separate and refuses an altered delivery deadline', async () => {
    const f = await fixture('SIMULATION');
    await f.db
      .getRepository(Order)
      .update(f.order.id, { disputeDeadlineAt: new Date() });
    expect(await f.service.evaluate(f.order.id)).toBeNull();
    await f.db.getRepository(Order).update(f.order.id, {
      disputeDeadlineAt: new Date(f.deliveredAt.getTime() + ms('72h')),
    });
    expect(await f.service.evaluate(f.order.id)).toMatchObject({
      mode: 'SIMULATION',
      entitlement: 500,
    });
  });
  it('waits for open disputes to finish', async () => {
    const f = await fixture();
    await f.db
      .getRepository(DisputeIssue)
      .update(f.issue.id, { status: 'AWAITING_EXECUTION' });
    expect(await f.service.evaluate(f.order.id)).toBeNull();
    expect(
      await f.db.getRepository(CoinGrant).countBy({ sourceId: f.order.id }),
    ).toBe(0);
  });
  it('corrects an existing reward from confirmed refunds while another dispute remains open and delivery metadata changes', async () => {
    const f = await fixture();
    const reward = await f.service.evaluate(f.order.id);
    expect(reward).toMatchObject({ entitlement: 500 });
    const now = new Date();
    const decision = await f.db.getRepository(DisputeDecision).save({
      issueId: f.issue.id,
      actorId: f.admin.id,
      outcome: 'UPHOLD_CLAIM',
      responsibility: 'SELLER',
      reason: 'Confirmed item refund',
      itemPrice: f.order.subtotal,
      refundAmount: 40000,
      decidedAt: now,
      appealUntil: now,
      finalizedAt: now,
      finalOutcome: 'UPHOLD_CLAIM',
      finalRefundAmount: 40000,
      finalReason: 'Confirmed item refund',
      finalActorId: null,
    });
    await f.db.getRepository(DisputeRefundCredit).save({
      decisionId: decision.id,
      orderId: f.order.id,
      buyerId: f.buyer.id,
      shopId: f.shop.id,
      mode: 'EVIDENCE',
      amount: 40000,
      commissionReversed: 1200,
      sellerDebit: 38800,
    });
    await f.db
      .getRepository(DisputeIssue)
      .update(f.issue.id, { status: 'ACTIVE' });
    await f.db
      .getRepository(Order)
      .update(f.order.id, { disputeDeadlineAt: new Date() });
    expect(await f.service.evaluate(f.order.id)).toMatchObject({
      entitlement: 300,
    });
    expect(
      await f.db
        .getRepository(CoinGrant)
        .findOneByOrFail({ id: reward!.grantId }),
    ).toMatchObject({ recovered: 200 });
    expect(await f.service.evaluate(f.order.id)).toMatchObject({
      entitlement: 300,
    });
    expect(
      await f.db
        .getRepository(CoinGrant)
        .findOneByOrFail({ id: reward!.grantId }),
    ).toMatchObject({ recovered: 200 });
  });
});
