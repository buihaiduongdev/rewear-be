import { randomUUID } from 'node:crypto';

import { GhnShipmentClient } from '@/infrastructure/shipping/clients/ghn-shipment.client';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { CodReconciliationService } from '@/modules/cod-reconciliation/cod-reconciliation.service';
import { CoinRewardService } from '@/modules/coins/coin-reward.service';
import { CoinService } from '@/modules/coins/coin.service';
import { CoinAccount, CoinPurchaseReward } from '@/modules/coins/entities';
import { DisputeAdjudicationService } from '@/modules/dispute/dispute-adjudication.service';
import { DisputeRefundService } from '@/modules/dispute/dispute-refund.service';
import { DisputeReturnService } from '@/modules/dispute/dispute-return.service';
import { DisputeCase } from '@/modules/dispute/entities/dispute-case.entity';
import { DisputeDecision } from '@/modules/dispute/entities/dispute-decision.entity';
import { DisputeIssue } from '@/modules/dispute/entities/dispute-issue.entity';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund-credit.entity';
import { OutboxService } from '@/modules/event/outbox.service';
import { Order } from '@/modules/order/entities';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { OrderFundingService } from '@/modules/order/order-funding.service';
import { OrderSettlementService } from '@/modules/order/order-settlement.service';
import { PaymentAttempt } from '@/modules/payment/entities';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { SHOP_LEDGER_ENTRY_TYPE } from '@/modules/shop-finance/constants/payout.constant';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';
import { ShopFinanceService } from '@/modules/shop-finance/shop-finance.service';
import { User } from '@/modules/user/entities';
import { WalletAccount, WalletCredit } from '@/modules/wallet/entities';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Automatic internal wallet refund execution (PostgreSQL)', () => {
  let database: TestDatabase;
  let refunds: DisputeRefundService;
  let adjudication: DisputeAdjudicationService;

  beforeAll(async () => {
    database = await createTestDatabase();
    const outbox = new OutboxService();
    refunds = new DisputeRefundService(database.dataSource, outbox);
    const returns = new DisputeReturnService(
      database.dataSource,
      {} as GhnShipmentClient,
      refunds,
    );
    adjudication = new DisputeAdjudicationService(
      database.dataSource,
      refunds,
      returns,
      outbox,
    );
  });

  afterAll(async () => database?.destroy());

  async function fundedCodFixture(
    mode: 'EVIDENCE' | 'SIMULATION' = 'EVIDENCE',
    refundAmount?: number,
  ) {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
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
    await db.getRepository(Order).update(f.order.id, { status: 'delivered' });
    await new CodReconciliationService(
      db,
      new CoinService(db),
    ).recordCollection(f.admin.id, f.order.id, {
      mode,
      waybillCode: shipment.orderCode!,
      collectedAmount: f.order.total,
      approvedCarrierFee: 0,
      collectedAt: f.order.deliveryObservedAt!.toISOString(),
      reason: 'Verified COD',
      evidence: 'Matched signed collection statement',
    });
    await db.getRepository(Order).update(f.order.id, { status: 'dispute' });
    const decision = await adjudication.decide(f.admin.id, f.issue.id, {
      outcome: 'UPHOLD_CLAIM',
      responsibility: 'SELLER',
      reason: 'Approved keep-refund remedy',
      refundAmount: refundAmount ?? f.order.subtotal,
    });
    await db
      .getRepository(DisputeDecision)
      .update(decision.id, { appealUntil: new Date(Date.now() - 1000) });
    return { ...f, db, shipment, decision };
  }

  it('automatically credits buyer wallet on finalization and is idempotent under concurrent execution', async () => {
    const f = await fundedCodFixture();
    await adjudication.refreshIssue(f.issue.id);
    await Promise.all([
      refunds.execute(f.decision.id),
      refunds.execute(f.decision.id),
    ]);
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(1);
    const credit = await f.db
      .getRepository(DisputeRefundCredit)
      .findOneByOrFail({ orderId: f.order.id });
    expect(credit).toMatchObject({
      amount: 100001,
      commissionReversed: 3000,
      sellerDebit: 97001,
    });
    expect(
      (
        await f.db
          .getRepository(WalletAccount)
          .findOneByOrFail({ userId: f.buyer.id })
      ).balance,
    ).toBe(100001);
    expect(
      (await f.db.getRepository(DisputeCase).findOneByOrFail({ id: f.row.id }))
        .state,
    ).toBe('CLOSED');

    // Concurrent first-refund WalletAccount creation across two distinct orders for one buyer
    const freshBuyer = await f.db.getRepository(User).save({
      email: `${randomUUID()}@test.local`,
      fullName: 'Concurrent Buyer',
      provider: f.buyer.provider,
      status: f.buyer.status,
      role: f.buyer.role,
    });
    const createDeliveredOrder = () =>
      f.db.getRepository(Order).save({
        checkoutOrderId: randomUUID(),
        buyerId: freshBuyer.id,
        shopId: f.shop.id,
        shopName: f.shop.name,
        status: 'delivered',
        paymentMethod: 'COD',
        subtotal: 50000,
        shippingFee: 20000,
        total: 70000,
        createdAt: new Date(Date.now() - 86400000),
        sellerConfirmBy: new Date(),
        deliveryObservedAt: f.order.deliveryObservedAt,
        address: {},
        items: [
          {
            productId: randomUUID(),
            title: 'Shirt snapshot',
            price: 50000,
            size: null,
            condition: 'GOOD',
            coverUrl: null,
            shippingPackage: null,
          },
        ],
      });
    const secondOrder = await createDeliveredOrder();
    const thirdOrder = await createDeliveredOrder();

    const prepareDecision = async (ord: Order) => {
      const collectedAt = new Date();
      await f.db
        .getRepository(Order)
        .update(ord.id, { createdAt: new Date(collectedAt.getTime() - 60000) });
      const ship = await f.db.getRepository(Shipment).save({
        orderId: ord.id,
        state: 'BOOKED',
        orderCode: randomUUID(),
        payload: {},
        input: {} as Shipment['input'],
        quotedParcel: {} as Shipment['quotedParcel'],
        codAmount: ord.total,
        providerStatus: 'delivered',
      });
      await new CodReconciliationService(
        f.db,
        new CoinService(f.db),
      ).recordCollection(f.admin.id, ord.id, {
        mode: 'EVIDENCE',
        waybillCode: ship.orderCode!,
        collectedAmount: ord.total,
        approvedCarrierFee: 0,
        collectedAt: collectedAt.toISOString(),
        reason: 'Verified COD',
        evidence: 'Signed proof',
      });
      await f.db.getRepository(Order).update(ord.id, { status: 'dispute' });
      const c = await f.db.getRepository(DisputeCase).save({
        orderId: ord.id,
        buyerId: freshBuyer.id,
        shopId: f.shop.id,
        state: 'OPEN',
        previousOrderStatus: 'delivered',
      });
      const iss = await f.db.getRepository(DisputeIssue).save({
        caseId: c.id,
        productId: ord.items[0].productId,
        kind: 'WRONG_ITEM',
        description: 'Wrong item',
        evidenceIds: [f.evidence.id],
        status: 'AWAITING_EXECUTION',
        sellerRespondBy: new Date(Date.now() - 10000),
        reviewDueAt: new Date(),
        maxReviewDueAt: new Date(),
      });
      return f.db.getRepository(DisputeDecision).save({
        issueId: iss.id,
        actorId: f.admin.id,
        outcome: 'UPHOLD_CLAIM',
        responsibility: 'SELLER',
        reason: 'Approved',
        itemPrice: 50000,
        refundAmount: 50000,
        decidedAt: new Date(),
        appealUntil: new Date(),
        finalizedAt: new Date(),
        finalOutcome: 'UPHOLD_CLAIM',
        finalRefundAmount: 50000,
        finalReason: 'Approved',
        finalActorId: null,
      });
    };

    const [d1, d2] = await Promise.all([
      prepareDecision(secondOrder),
      prepareDecision(thirdOrder),
    ]);
    await Promise.all([refunds.execute(d1.id), refunds.execute(d2.id)]);
    expect(
      (
        await f.db
          .getRepository(WalletAccount)
          .findOneByOrFail({ userId: freshBuyer.id })
      ).balance,
    ).toBe(100000);
  });

  it('claws back granted purchase reward coins when a dispute refund executes', async () => {
    const f = await fundedCodFixture();
    const deliveredAt = new Date(Date.now() - 4 * 86400000);
    const disputeDeadlineAt = new Date(deliveredAt.getTime() + 72 * 3600000);
    await f.db.getRepository(Order).update(f.order.id, {
      createdAt: new Date(deliveredAt.getTime() - 3600000),
      deliveryObservedAt: deliveredAt,
      deliveryVerifiedAt: deliveredAt,
      disputeDeadlineAt,
    });
    await f.db.getRepository(OrderDeliveryVerification).save({
      orderId: f.order.id,
      deliveredAt,
      disputeDeadlineAt,
      mode: 'EVIDENCE',
      actorId: f.admin.id,
      reason: 'Verified delivery',
      evidence: 'Signed handoff',
    });
    const { status: prevStatus } = await f.db
      .getRepository(DisputeIssue)
      .findOneByOrFail({ id: f.issue.id });
    await f.db
      .getRepository(DisputeIssue)
      .update(f.issue.id, { status: 'RESOLVED_NO_REFUND' });
    const rewards = new CoinRewardService(f.db, new CoinService(f.db));
    const reward = await rewards.evaluate(f.order.id);
    expect(reward?.entitlement).toBe(500);
    await f.db
      .getRepository(DisputeIssue)
      .update(f.issue.id, { status: prevStatus });
    await adjudication.refreshIssue(f.issue.id);
    await refunds.execute(f.decision.id);
    expect(await rewards.evaluate(f.order.id)).toMatchObject({
      grantedAmount: 500,
      entitlement: 0,
      recoveredAmount: 500,
    });
    expect(
      await f.db
        .getRepository(CoinPurchaseReward)
        .findOneByOrFail({ orderId: f.order.id }),
    ).toMatchObject({
      grantedAmount: 500,
      entitlement: 0,
      recoveredAmount: 500,
    });
    expect(
      await f.db
        .getRepository(CoinAccount)
        .findOneByOrFail({ userId: f.buyer.id }),
    ).toMatchObject({ balance: 0 });
  });

  it('deducts partial refund seller debit cleanly before releasing remaining escrow to Shop', async () => {
    const f = await fundedCodFixture('EVIDENCE', 40000);
    await adjudication.refreshIssue(f.issue.id);

    await new CodReconciliationService(
      f.db,
      new CoinService(f.db),
    ).recordRemittance(f.admin.id, {
      reference: randomUUID(),
      mode: 'EVIDENCE',
      netAmount: f.order.total,
      receivedAt: new Date().toISOString(),
      reason: 'Received order cash',
      evidence: 'Bank receipt',
      allocations: [
        { orderId: f.order.id, cashAmount: f.order.total, feeDeducted: 0 },
      ],
    });
    const settlement = new OrderSettlementService(
      f.db,
      new OrderFundingService(),
      new OutboxService(),
    );
    await settlement.verifyDelivery(f.admin.id, f.order.id, {
      deliveredAt: f.order.deliveryObservedAt!.toISOString(),
      mode: 'EVIDENCE',
      reason: 'Verified delivery timestamp',
      evidence: 'Carrier receipt',
    });
    expect(await settlement.settleOrder(f.order.id)).toMatchObject({
      amount: 58201,
      refundDebit: 38800,
    });
    expect(
      await new ShopFinanceService(f.db).view(f.owner.id, f.shop.id, {}),
    ).toMatchObject({
      available: 58201,
    });
  });

  it('isolates PayOS refunds into simulationBalance and blocks cancellation refund overlap', async () => {
    const f = await fundedCodFixture();
    const checkout = await f.db.getRepository(Checkout).save({
      buyerId: f.buyer.id,
      requestId: randomUUID(),
      addressId: randomUUID(),
      requestedProductIds: f.order.items.map((i) => i.productId),
      address: {},
      status: 'PAID',
    });
    const payment = await f.db.getRepository(PaymentAttempt).save({
      checkoutId: checkout.id,
      buyerId: f.buyer.id,
      requestId: randomUUID(),
      amount: f.order.total,
      capturedAmount: f.order.total,
      state: 'PAID',
      providerTransId: randomUUID(),
      paidAt: new Date(f.order.createdAt.getTime() + 3600000),
      nextQueryAt: new Date(),
      orders: [
        {
          checkoutOrderId: f.order.checkoutOrderId,
          shopId: f.shop.id,
          shopName: f.shop.name,
          subtotal: f.order.subtotal,
          shippingFee: f.order.shippingFee,
          address: f.order.address,
          items: f.order.items,
        },
      ],
    });
    await f.db.getRepository(Order).update(f.order.id, {
      paymentId: payment.id,
      checkoutId: checkout.id,
      paymentMethod: 'PAYOS',
    });
    await f.db.getRepository(Shipment).update(f.shipment.id, { codAmount: 0 });

    await adjudication.refreshIssue(f.issue.id);
    expect(
      await f.db
        .getRepository(WalletAccount)
        .findOneByOrFail({ userId: f.buyer.id }),
    ).toMatchObject({ balance: 0, simulationBalance: 100001 });

    // Cancellation overlap check on another order
    const cancelled = await fundedCodFixture();
    await cancelled.db.getRepository(WalletCredit).save({
      userId: cancelled.buyer.id,
      orderId: cancelled.order.id,
      amount: cancelled.order.total,
      reason: 'ORDER_CANCELLED',
    });
    await adjudication.refreshIssue(cancelled.issue.id);
    expect(
      await cancelled.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: cancelled.order.id }),
    ).toBe(0);
    expect(
      (
        await cancelled.db
          .getRepository(DisputeIssue)
          .findOneByOrFail({ id: cancelled.issue.id })
      ).status,
    ).toBe('AWAITING_EXECUTION');
  });

  it('isolates COD_SHIPPING_DEBIT ledger entries from refund funding, coin rewards, and shop refund deductions', async () => {
    const f = await fundedCodFixture('EVIDENCE', 40000);
    await f.db.getRepository(ShopLedgerEntry).save({
      orderId: f.order.id,
      shopId: f.shop.id,
      collectionId: null,
      mode: 'EVIDENCE',
      type: SHOP_LEDGER_ENTRY_TYPE.COD_SHIPPING_DEBIT,
      amount: 60000,
      actorId: f.admin.id,
    });

    await adjudication.refreshIssue(f.issue.id);
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(1);

    const finance = new ShopFinanceService(f.db);
    const awaitingView = await finance.view(f.owner.id, f.shop.id, {});
    expect(awaitingView).toMatchObject({
      held: 0,
      receivable: 58201,
      shippingDebit: 60000,
      paidOutDebt: 60000,
    });

    await new CodReconciliationService(
      f.db,
      new CoinService(f.db),
    ).recordRemittance(f.admin.id, {
      reference: randomUUID(),
      mode: 'EVIDENCE',
      netAmount: f.order.total,
      receivedAt: new Date().toISOString(),
      reason: 'Received order cash alongside shipping debit',
      evidence: 'Bank receipt',
      allocations: [
        { orderId: f.order.id, cashAmount: f.order.total, feeDeducted: 0 },
      ],
    });

    const fundedView = await finance.view(f.owner.id, f.shop.id, {});
    expect(fundedView).toMatchObject({
      held: 58201,
      receivable: 0,
      shippingDebit: 60000,
      paidOutDebt: 60000,
    });

    const deliveredAt = new Date(Date.now() - 4 * 86400000);
    const disputeDeadlineAt = new Date(deliveredAt.getTime() + 72 * 3600000);
    await f.db.getRepository(Order).update(f.order.id, {
      createdAt: new Date(deliveredAt.getTime() - 3600000),
      deliveryObservedAt: deliveredAt,
      deliveryVerifiedAt: deliveredAt,
      disputeDeadlineAt,
    });
    await f.db.getRepository(OrderDeliveryVerification).save({
      orderId: f.order.id,
      deliveredAt,
      disputeDeadlineAt,
      mode: 'EVIDENCE',
      actorId: f.admin.id,
      reason: 'Verified delivery',
      evidence: 'Signed handoff',
    });
    const rewards = new CoinRewardService(f.db, new CoinService(f.db));
    expect(await rewards.evaluate(f.order.id)).toMatchObject({
      entitlement: 300,
      grantedAmount: 300,
    });
  });
});
