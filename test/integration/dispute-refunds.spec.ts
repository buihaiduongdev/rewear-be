import { randomUUID } from 'node:crypto';

import { MAX_SAFE_BALANCE } from '@/common/constants/money.constant';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { CodReconciliationService } from '@/modules/cod-reconciliation/cod-reconciliation.service';
import { CodCollection } from '@/modules/cod-reconciliation/entities/cod-reconciliation.entity';
import { CoinService } from '@/modules/coins/core/coin.service';
import { CoinGrant } from '@/modules/coins/core/entities';
import { CoinRewardService } from '@/modules/coins/rewards/coin-reward.service';
import { CoinRewardAdjustmentNotice } from '@/modules/coins/rewards/entities';
import { DisputeAdjudicationService } from '@/modules/dispute/dispute-adjudication.service';
import { DisputeRefundService } from '@/modules/dispute/dispute-refund.service';
import { DisputeReviewService } from '@/modules/dispute/dispute-review.service';
import { DisputeFinalDecision } from '@/modules/dispute/entities/dispute-appeal.entity';
import { DisputeDecision } from '@/modules/dispute/entities/dispute-decision.entity';
import {
  DisputeRefund,
  DisputeRefundCredit,
} from '@/modules/dispute/entities/dispute-refund.entity';
import {
  DisputeCase,
  DisputeIssue,
} from '@/modules/dispute/entities/dispute.entity';
import { ORDER_POLICY } from '@/modules/order/constants/order.constant';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { Order } from '@/modules/order/entities/order.entity';
import { OrderFundingService } from '@/modules/order/order-funding.service';
import { OrderSettlementService } from '@/modules/order/order-settlement.service';
import {
  PaymentAttempt,
  PaymentRefund,
} from '@/modules/payment/entities/payment.entity';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';
import { ShopSettlement } from '@/modules/shop-finance/entities/shop-settlement.entity';
import {
  ShopPayout,
  ShopPayoutAllocation,
} from '@/modules/shop-finance/payouts/entities/shop-payout.entity';
import { ShopFinanceService } from '@/modules/shop-finance/shop-finance.service';
import { WalletAccount } from '@/modules/wallet/entities/wallet.entity';
import { WalletCredit } from '@/modules/wallet/entities/wallet.entity';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Final dispute refund execution (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: DisputeRefundService;
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new DisputeRefundService(database.dataSource);
  });
  afterAll(async () => database?.destroy());
  async function fixture(
    mode: 'EVIDENCE' | 'SIMULATION' = 'EVIDENCE',
    condition:
      | 'MISSING_ITEM'
      | 'RETURN_REQUIRED'
      | 'PARTIAL_AGREEMENT'
      | 'SELLER_WAIVER' = 'MISSING_ITEM',
  ) {
    const db = database.dataSource,
      f = await adjudicationFixture(db);
    await db.getRepository(DisputeIssue).update(f.issue.id, {
      kind: condition === 'MISSING_ITEM' ? 'MISSING_ITEM' : 'WRONG_ITEM',
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
    const initial = new DisputeAdjudicationService(db);
    const decision = await initial.decide(f.admin.id, f.issue.id, {
      requestId: randomUUID(),
      reviewToken: (await initial.review(f.issue.id)).reviewToken,
      outcome:
        condition === 'RETURN_REQUIRED' ? 'REQUIRE_RETURN' : 'UPHOLD_CLAIM',
      responsibility: 'SELLER',
      reason: 'Approved remedy',
      evidenceAssessment: 'Reviewed both parties',
      refundPlan: {
        amount: condition === 'PARTIAL_AGREEMENT' ? 40000 : f.order.subtotal,
        condition,
      },
    });
    await db
      .getRepository(DisputeDecision)
      .update(decision.id, { appealUntil: new Date(Date.now() - 1000) });
    await new DisputeReviewService(db).refreshIssue(f.issue.id);
    const final = await db
      .getRepository(DisputeFinalDecision)
      .findOneByOrFail({ decisionId: decision.id });
    return { ...f, db, decision, final, shipment };
  }
  it('automatically queues finals and refunds verified COD before remittance, idempotently under concurrent workers', async () => {
    const f = await fixture();
    await service.run();
    const results = await Promise.all([
      service.refresh(f.final.id),
      service.refresh(f.final.id),
    ]);
    expect(results[0]?.status).toBe('SUCCEEDED');
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
      advanceAmount: 100001,
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
  it('recovers an earlier purchase reward after a final goods refund without waiting for carrier remittance', async () => {
    const f = await fixture();
    const deliveredAt = f.order.deliveryObservedAt!;
    const disputeDeadlineAt = new Date(
      deliveredAt.getTime() + ORDER_POLICY.DISPUTE_WINDOW_MS,
    );
    await f.db.getRepository(Order).update(f.order.id, {
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
    await f.db
      .getRepository(DisputeIssue)
      .update(f.issue.id, { status: 'RESOLVED_NO_REFUND' });
    const rewards = new CoinRewardService(f.db, new CoinService());
    const reward = await rewards.evaluate(f.order.id);
    expect(reward?.entitlement).toBe(500);
    await f.db
      .getRepository(DisputeIssue)
      .update(f.issue.id, { status: 'AWAITING_EXECUTION' });
    await service.refresh(f.final.id);
    expect(
      await f.db
        .getRepository(CoinRewardAdjustmentNotice)
        .findBy({ orderId: f.order.id }),
    ).toEqual([
      expect.objectContaining({
        entitlement: 0,
        previousEntitlement: 500,
        pendingRecovery: 0,
        recovered: 500,
      }),
    ]);
    expect(await rewards.evaluate(f.order.id)).toMatchObject({
      entitlement: 0,
    });
    expect(
      await f.db
        .getRepository(CoinRewardAdjustmentNotice)
        .countBy({ orderId: f.order.id }),
    ).toBe(1);
    expect(
      await f.db
        .getRepository(CoinGrant)
        .findOneByOrFail({ id: reward!.grantId }),
    ).toMatchObject({ amount: 500, recovered: 500 });
  });
  it('keeps simulated money isolated from spendable evidenced balance', async () => {
    const f = await fixture('SIMULATION');
    await service.refresh(f.final.id);
    const account = await f.db
      .getRepository(WalletAccount)
      .findOneByOrFail({ userId: f.buyer.id });
    expect(account.balance).toBe(0);
    expect(account.simulationBalance).toBe(100001);
  });
  it('funds buyer refunds without counting settlement cash already reserved for a Shop payout', async () => {
    const f = await fixture();
    await new CodReconciliationService(f.db).recordRemittance(f.admin.id, {
      requestId: randomUUID(),
      reference: randomUUID(),
      mode: 'EVIDENCE',
      netAmount: f.order.total,
      receivedAt: new Date().toISOString(),
      reason: 'Received order cash',
      evidence: 'Matched bank receipt',
      allocations: [
        { orderId: f.order.id, cashAmount: f.order.total, feeDeducted: 0 },
      ],
    });
    const funded = await f.db
      .getRepository(ShopLedgerEntry)
      .findOneByOrFail({ orderId: f.order.id });
    const settlement = await f.db.getRepository(ShopSettlement).save({
      orderId: f.order.id,
      shopId: f.shop.id,
      creditId: funded.id,
      mode: 'EVIDENCE',
      amount: funded.amount,
      refundDebit: 0,
    });
    const payout = await f.db.getRepository(ShopPayout).save({
      shopId: f.shop.id,
      ownerId: f.owner.id,
      requestId: randomUUID(),
      bankAccountId: randomUUID(),
      recipientSnapshot: {},
      mode: 'EVIDENCE',
      status: 'PROCESSING',
      amount: 60000,
    });
    await f.db.getRepository(ShopPayoutAllocation).save({
      payoutId: payout.id,
      kind: 'SETTLEMENT',
      sourceId: settlement.id,
      orderId: f.order.id,
      mode: 'EVIDENCE',
      amount: 60000,
    });
    await service.refresh(f.final.id);
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .findOneByOrFail({ orderId: f.order.id }),
    ).toMatchObject({ amount: 100001, advanceAmount: 60000 });
    expect(
      await new ShopFinanceService(f.db).view(f.owner.id, f.shop.id, {}),
    ).toMatchObject({
      available: 0,
      payoutLocked: 60000,
      heldShortfall: 60000,
    });
  });
  it('does not assume a required return happened', async () => {
    const f = await fixture('EVIDENCE', 'RETURN_REQUIRED');
    expect(await service.refresh(f.final.id)).toMatchObject({
      status: 'PENDING',
      blockedReason: 'CONDITIONS_PENDING',
    });
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(0);
  });
  it('requires both parties consent to the exact partial amount and credits only after agreement', async () => {
    const f = await fixture('EVIDENCE', 'PARTIAL_AGREEMENT');
    expect(await service.refresh(f.final.id)).toMatchObject({
      blockedReason: 'CONSENT_PENDING',
    });
    const token = service.planToken(f.final);
    await service.consent(f.buyer.id, f.final.id, { planToken: token });
    expect(await service.refresh(f.final.id)).toMatchObject({
      status: 'PENDING',
    });
    await expect(
      service.consent(f.owner.id, f.final.id, { planToken: '0'.repeat(64) }),
    ).rejects.toThrow('changed');
    await service.consent(f.owner.id, f.final.id, { planToken: token });
    expect(await service.refresh(f.final.id)).toMatchObject({
      status: 'SUCCEEDED',
    });
    expect(
      (
        await f.db
          .getRepository(WalletAccount)
          .findOneByOrFail({ userId: f.buyer.id })
      ).balance,
    ).toBe(40000);
  });
  it('keeps other unresolved issues held after paying one eligible issue', async () => {
    const f = await fixture();
    await f.db.getRepository(DisputeIssue).save({
      ...f.issue,
      id: randomUUID(),
      kind: 'NOT_AS_DESCRIBED',
      status: 'ACTIVE',
    });
    await service.refresh(f.final.id);
    expect(
      (await f.db.getRepository(DisputeCase).findOneByOrFail({ id: f.row.id }))
        .state,
    ).toBe('OPEN');
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('dispute');
  });
  it('a historical final with no exact plan stays pending and never infers the item ceiling', async () => {
    const f = await fixture();
    await f.db
      .getRepository(DisputeFinalDecision)
      .update(f.final.id, { refundPlan: null });
    expect(await service.refresh(f.final.id)).toMatchObject({
      blockedReason: 'PLAN_MISSING',
    });
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(0);
  });
  it('rolls back wallet, credit and issue together when the audit write fails', async () => {
    const f = await fixture();
    await f.db.query(
      'ALTER TABLE dispute_audits ADD CONSTRAINT test_refund_audit_failure CHECK (false) NOT VALID',
    );
    try {
      await expect(service.refresh(f.final.id)).rejects.toThrow(
        'test_refund_audit_failure',
      );
    } finally {
      await f.db.query(
        'ALTER TABLE dispute_audits DROP CONSTRAINT test_refund_audit_failure',
      );
    }
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(0);
    expect(
      await f.db.getRepository(WalletAccount).countBy({ userId: f.buyer.id }),
    ).toBe(0);
    expect(
      (
        await f.db
          .getRepository(DisputeIssue)
          .findOneByOrFail({ id: f.issue.id })
      ).status,
    ).toBe('AWAITING_EXECUTION');
    expect((await service.refresh(f.final.id))?.status).toBe('SUCCEEDED');
  });
  it('moves the same-order debit from receivable to held, then releases only remaining seller net', async () => {
    const f = await fixture('EVIDENCE', 'PARTIAL_AGREEMENT');
    const token = service.planToken(f.final);
    await service.consent(f.buyer.id, f.final.id, { planToken: token });
    await service.consent(f.owner.id, f.final.id, { planToken: token });
    await service.refresh(f.final.id);
    const finance = new ShopFinanceService(f.db);
    expect(await finance.view(f.owner.id, f.shop.id, {})).toMatchObject({
      held: 0,
      available: 0,
      receivable: 58201,
    });
    await new CodReconciliationService(f.db).recordRemittance(f.admin.id, {
      requestId: randomUUID(),
      reference: randomUUID(),
      mode: 'EVIDENCE',
      netAmount: f.order.total,
      receivedAt: new Date().toISOString(),
      reason: 'Received exact order cash',
      evidence: 'Bank receipt',
      allocations: [
        { orderId: f.order.id, cashAmount: f.order.total, feeDeducted: 0 },
      ],
    });
    expect(await finance.view(f.owner.id, f.shop.id, {})).toMatchObject({
      held: 58201,
      available: 0,
      receivable: 0,
    });
    const settlement = new OrderSettlementService(
      f.db,
      new OrderFundingService(),
    );
    await settlement.verifyDelivery(f.admin.id, f.order.id, {
      deliveredAt: f.order.deliveryObservedAt!.toISOString(),
      mode: 'EVIDENCE',
      reason: 'Verified exact timestamp',
      evidence: 'Carrier receipt',
    });
    expect(await settlement.settleOrder(f.order.id)).toMatchObject({
      amount: 58201,
      refundDebit: 38800,
    });
    expect(await finance.view(f.owner.id, f.shop.id, {})).toMatchObject({
      held: 0,
      available: 58201,
      receivable: 0,
    });
  });
  it('requires verified buyer payment and rejects cancellation refund overlap', async () => {
    const f = await fixture();
    await f.db.getRepository(WalletCredit).save({
      userId: f.buyer.id,
      orderId: f.order.id,
      amount: f.order.total,
      reason: 'ORDER_CANCELLED',
    });
    expect(await service.refresh(f.final.id)).toMatchObject({
      blockedReason: 'PAYMENT_UNVERIFIED',
    });
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(0);
  });
  it('never treats a delivered parcel or a mismatched collected amount as payment proof', async () => {
    const f = await fixture();
    await f.db
      .getRepository(CodCollection)
      .update({ orderId: f.order.id }, { collectedAmount: f.order.total - 1 });
    expect(await service.refresh(f.final.id)).toMatchObject({
      blockedReason: 'PAYMENT_UNVERIFIED',
    });
  });
  it('deduplicates overlapping final entitlements for one item across different issues', async () => {
    const f = await fixture();
    await service.refresh(f.final.id);
    const secondIssue = await f.db.getRepository(DisputeIssue).save({
      ...f.issue,
      id: randomUUID(),
      kind: 'NOT_AS_DESCRIBED',
      status: 'AWAITING_EXECUTION',
    });
    await f.db.getRepository(DisputeCase).update(f.row.id, { state: 'OPEN' });
    await f.db.getRepository(Order).update(f.order.id, { status: 'dispute' });
    const secondInitial = await f.db.getRepository(DisputeDecision).save({
      ...f.decision,
      id: randomUUID(),
      issueId: secondIssue.id,
      requestId: randomUUID(),
    });
    const secondFinal = await f.db.getRepository(DisputeFinalDecision).save({
      ...f.final,
      id: randomUUID(),
      decisionId: secondInitial.id,
      issueId: secondIssue.id,
      requestId: null,
      refundPlan: { amount: 40000, condition: 'PARTIAL_AGREEMENT' },
    });
    const token = service.planToken(secondFinal);
    await service.consent(f.buyer.id, secondFinal.id, { planToken: token });
    await service.consent(f.owner.id, secondFinal.id, { planToken: token });
    expect(await service.refresh(secondFinal.id)).toMatchObject({
      status: 'SUCCEEDED',
    });
    const refund = await f.db
      .getRepository(DisputeRefund)
      .findOneByOrFail({ finalDecisionId: secondFinal.id });
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .findOneByOrFail({ refundId: refund.id }),
    ).toMatchObject({ amount: 0, sellerDebit: 0 });
    expect(
      (
        await f.db
          .getRepository(WalletAccount)
          .findOneByOrFail({ userId: f.buyer.id })
      ).balance,
    ).toBe(100001);
  });

  it('preserves eligibility across failures, alerts once after five minutes and recovers without buyer resubmission', async () => {
    const f = await fixture();
    await f.db
      .getRepository(WalletAccount)
      .save({ userId: f.buyer.id, balance: MAX_SAFE_BALANCE });
    await expect(service.refresh(f.final.id)).rejects.toThrow(
      'Wallet refund exceeds safe balance',
    );
    const refund = await f.db
      .getRepository(DisputeRefund)
      .findOneByOrFail({ finalDecisionId: f.final.id });
    expect(refund.eligibleAt).toBeInstanceOf(Date);
    const originalEligibility = new Date(Date.now() - 360000);
    await f.db.getRepository(DisputeRefund).update(refund.id, {
      eligibleAt: originalEligibility,
      dueAt: new Date(Date.now() - 60000),
    });
    await expect(service.refresh(f.final.id)).rejects.toThrow(
      'Wallet refund exceeds safe balance',
    );
    const alerted = await f.db
      .getRepository(DisputeRefund)
      .findOneByOrFail({ id: refund.id });
    expect(alerted.alertedAt).toBeInstanceOf(Date);
    expect(
      alerted.responseDueAt!.getTime() - alerted.alertedAt!.getTime(),
    ).toBe(14400000);
    expect(alerted.eligibleAt).toEqual(originalEligibility);
    await f.db
      .getRepository(WalletAccount)
      .update({ userId: f.buyer.id }, { balance: 0 });
    await service.run();
    expect(
      await f.db
        .getRepository(DisputeRefund)
        .findOneByOrFail({ id: refund.id }),
    ).toMatchObject({ status: 'SUCCEEDED', eligibleAt: originalEligibility });
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(1);
  });
  it('uses partial order receipts only once and records only the unfunded item refund as an advance', async () => {
    const f = await fixture();
    await new CodReconciliationService(f.db).recordRemittance(f.admin.id, {
      requestId: randomUUID(),
      reference: randomUUID(),
      mode: 'EVIDENCE',
      netAmount: 80000,
      receivedAt: new Date().toISOString(),
      reason: 'Partial bank receipt',
      evidence: 'Order matched receipt',
      allocations: [{ orderId: f.order.id, cashAmount: 80000, feeDeducted: 0 }],
    });
    await service.refresh(f.final.id);
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .findOneByOrFail({ orderId: f.order.id }),
    ).toMatchObject({ amount: 100001, advanceAmount: 50001 });
  });
  async function momoFixture() {
    const f = await fixture();
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
      paymentMethod: 'MOMO',
    });
    await f.db.getRepository(Shipment).update(f.shipment.id, { codAmount: 0 });
    return { ...f, payment };
  }
  it('refunds verified MoMo Sandbox only into simulation balance', async () => {
    const f = await momoFixture();
    expect(await service.refresh(f.final.id)).toMatchObject({
      status: 'SUCCEEDED',
      mode: 'SIMULATION',
    });
    expect(
      await f.db
        .getRepository(WalletAccount)
        .findOneByOrFail({ userId: f.buyer.id }),
    ).toMatchObject({ balance: 0, simulationBalance: 100001 });
  });
  it('blocks an original-capture refund but does not confuse a duplicate-capture provider refund with it', async () => {
    const blocked = await momoFixture();
    await blocked.db.getRepository(PaymentRefund).save({
      paymentId: blocked.payment.id,
      providerTransId: blocked.payment.providerTransId!,
      amount: blocked.order.total,
      reason: 'LATE_OR_INVALID_CAPTURE',
      state: 'QUEUED',
      nextQueryAt: new Date(),
    });
    expect(await service.refresh(blocked.final.id)).toMatchObject({
      status: 'PENDING',
      blockedReason: 'PAYMENT_UNVERIFIED',
    });
    const valid = await momoFixture();
    await valid.db.getRepository(PaymentRefund).save({
      paymentId: valid.payment.id,
      providerTransId: randomUUID(),
      amount: valid.order.total,
      reason: 'LATE_OR_INVALID_CAPTURE',
      state: 'QUEUED',
      nextQueryAt: new Date(),
    });
    expect(await service.refresh(valid.final.id)).toMatchObject({
      status: 'SUCCEEDED',
    });
  });
  it('does not convert mismatched funding modes or a wrong funding credit into an evidenced wallet refund', async () => {
    const f = await fixture();
    await f.db.getRepository(ShopLedgerEntry).save({
      orderId: f.order.id,
      shopId: f.shop.id,
      collectionId: null,
      mode: 'SIMULATION',
      type: 'MOMO_FUNDED_HELD',
      amount: 97001,
      actorId: f.admin.id,
    });
    expect(await service.refresh(f.final.id)).toMatchObject({
      status: 'PENDING',
      blockedReason: 'PAYMENT_UNVERIFIED',
    });
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(0);
  });
  it('seller-approved full return waiver does not add another buyer confirmation gate', async () => {
    const f = await fixture('EVIDENCE', 'SELLER_WAIVER');
    await service.consent(f.owner.id, f.final.id, {
      planToken: service.planToken(f.final),
    });
    expect(await service.refresh(f.final.id)).toMatchObject({
      status: 'SUCCEEDED',
    });
  });
});
