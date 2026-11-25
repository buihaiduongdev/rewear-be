import { randomUUID } from 'node:crypto';

import { GhnShipmentClient } from '@/infrastructure/shipping/clients/ghn-shipment.client';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { CodReconciliationService } from '@/modules/cod-reconciliation/cod-reconciliation.service';
import { DisputeAdjudicationService } from '@/modules/dispute/dispute-adjudication.service';
import { DisputeRefundService } from '@/modules/dispute/dispute-refund.service';
import { DisputeAccess } from '@/modules/dispute/dispute.access';
import { DisputeCase } from '@/modules/dispute/entities/dispute-case.entity';
import { DisputeDecision } from '@/modules/dispute/entities/dispute-decision.entity';
import { DisputeIssue } from '@/modules/dispute/entities/dispute-issue.entity';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund-credit.entity';
import { DisputeReturnService } from '@/modules/dispute/returns/return.service';
import { Order } from '@/modules/order/entities';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { OrderFundingService } from '@/modules/order/order-funding.service';
import { OrderSettlementService } from '@/modules/order/order-settlement.service';
import { OrderAccess } from '@/modules/order/order.access';
import { PaymentAttempt } from '@/modules/payment/entities';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { ShopFinanceService } from '@/modules/shop-finance/shop-finance.service';
import { WalletAccount, WalletCredit } from '@/modules/wallet/entities';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Automatic internal wallet refund execution (PostgreSQL)', () => {
  let database: TestDatabase;
  let refunds: DisputeRefundService;
  let adjudication: DisputeAdjudicationService;

  beforeAll(async () => {
    database = await createTestDatabase();
    const orderAccess = new OrderAccess();
    const access = new DisputeAccess(orderAccess);
    refunds = new DisputeRefundService(database.dataSource, access);
    const returns = new DisputeReturnService(
      database.dataSource,
      {} as GhnShipmentClient,
      access,
      orderAccess,
      refunds,
    );
    adjudication = new DisputeAdjudicationService(
      database.dataSource,
      access,
      refunds,
      returns,
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
    await new CodReconciliationService(db).recordCollection(
      f.admin.id,
      f.order.id,
      {
        requestId: randomUUID(),
        mode,
        waybillCode: shipment.orderCode!,
        collectedAmount: f.order.total,
        approvedCarrierFee: 0,
        collectedAt: f.order.deliveryObservedAt!.toISOString(),
        reason: 'Verified COD',
        evidence: 'Matched signed collection statement',
      },
    );
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
  });

  it('deducts partial refund seller debit cleanly before releasing remaining escrow to Shop', async () => {
    const f = await fundedCodFixture('EVIDENCE', 40000);
    await adjudication.refreshIssue(f.issue.id);

    await new CodReconciliationService(f.db).recordRemittance(f.admin.id, {
      requestId: randomUUID(),
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
    void OrderDeliveryVerification;
  });
});
