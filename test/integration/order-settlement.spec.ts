import { randomUUID } from 'node:crypto';

import ms from 'ms';

import { AuthProvider } from '@/modules/auth/enums';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { CodReconciliationService } from '@/modules/cod-reconciliation/cod-reconciliation.service';
import { Order, OrderEvent } from '@/modules/order/entities/order.entity';
import { OrderFundingService } from '@/modules/order/order-funding.service';
import { OrderSettlementService } from '@/modules/order/order-settlement.service';
import {
  PaymentAttempt,
  PaymentRefund,
} from '@/modules/payment/entities/payment.entity';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';
import { ShopSettlement } from '@/modules/shop-finance/entities/shop-settlement.entity';
import { ShopFinanceService } from '@/modules/shop-finance/shop-finance.service';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserStatus } from '@/modules/user/enums';
import { WalletCredit } from '@/modules/wallet/entities/wallet.entity';

import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Receipt and evidenced 72-hour settlement (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: OrderSettlementService;
  let reconciliation: CodReconciliationService;
  const adminId = randomUUID();
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new OrderSettlementService(
      database.dataSource,
      new OrderFundingService(),
    );
    reconciliation = new CodReconciliationService(database.dataSource);
  });
  afterAll(async () => database?.destroy());
  async function fixture(age = ms('73h')) {
    const db = database.dataSource;
    const buyer = await db.getRepository(User).save({
      email: `${randomUUID()}@test.local`,
      fullName: 'Buyer',
      provider: AuthProvider.CREDENTIALS,
      status: UserStatus.ACTIVE,
    });
    const shop = await db.getRepository(Shop).save({ name: 'Settlement shop' });
    await db.getRepository(ShopMember).save({
      shopId: shop.id,
      userId: buyer.id,
      memberRole: ShopMemberRole.OWNER,
    });
    const deliveredAt = new Date(Date.now() - age);
    const order = await db.getRepository(Order).save({
      checkoutOrderId: randomUUID(),
      buyerId: buyer.id,
      shopId: shop.id,
      shopName: shop.name,
      paymentMethod: 'COD',
      status: 'delivered',
      subtotal: 200000,
      shippingFee: 30000,
      total: 230000,
      commissionBasisPoints: 300,
      createdAt: new Date(deliveredAt.getTime() - ms('24h')),
      sellerConfirmBy: new Date(deliveredAt.getTime() - ms('1h')),
      deliveryObservedAt: deliveredAt,
      address: {},
      items: [
        {
          productId: randomUUID(),
          title: 'Jacket',
          price: 200000,
          size: null,
          condition: 'GOOD',
          coverUrl: null,
          shippingPackage: null,
        },
      ],
    });
    const shipment = await db.getRepository(Shipment).save({
      orderId: order.id,
      state: 'BOOKED',
      orderCode: randomUUID(),
      payload: {},
      input: {} as Shipment['input'],
      quotedParcel: {} as Shipment['quotedParcel'],
      codAmount: 230000,
      providerStatus: 'delivered',
    });
    const verification = {
      deliveredAt: deliveredAt.toISOString(),
      mode: 'EVIDENCE' as const,
      reason: 'Delivery time independently checked',
      evidence: 'Carrier signed delivery receipt',
    };
    return { db, buyer, shop, order, shipment, verification };
  }
  async function fund(
    f: Awaited<ReturnType<typeof fixture>>,
    mode: 'EVIDENCE' | 'SIMULATION' = 'EVIDENCE',
    cashAmount = 230000,
  ) {
    await reconciliation.recordCollection(adminId, f.order.id, {
      requestId: randomUUID(),
      mode,
      waybillCode: f.shipment.orderCode!,
      collectedAmount: 230000,
      approvedCarrierFee: 0,
      collectedAt: f.verification.deliveredAt,
      reason: 'Matched collection',
      evidence: 'Carrier collection statement',
    });
    await reconciliation.recordRemittance(adminId, {
      requestId: randomUUID(),
      reference: randomUUID(),
      mode,
      netAmount: cashAmount,
      receivedAt: new Date().toISOString(),
      reason: 'Matched receipt',
      evidence: 'Bank proof',
      allocations: [{ orderId: f.order.id, cashAmount, feeDeducted: 0 }],
    });
  }
  it('receipt is buyer-scoped, idempotent, and never releases early or changes the deadline', async () => {
    const f = await fixture(ms('1h'));
    await fund(f);
    await service.verifyDelivery(adminId, f.order.id, f.verification);
    await expect(
      service.confirmReceipt(randomUUID(), f.order.id),
    ).rejects.toThrow('Could not find any entity of type "Order"');
    const first = await service.confirmReceipt(f.buyer.id, f.order.id);
    const second = await service.confirmReceipt(f.buyer.id, f.order.id);
    expect(first.status).toBe('completed');
    expect(second.receiptConfirmedAt).toEqual(first.receiptConfirmedAt);
    expect(first.disputeDeadlineAt!.getTime()).toBe(
      new Date(f.verification.deliveredAt).getTime() + ms('72h'),
    );
    await service.settleOrder(f.order.id);
    expect(await f.db.getRepository(ShopSettlement).count()).toBe(0);
    expect(
      await f.db
        .getRepository(OrderEvent)
        .countBy({ orderId: f.order.id, action: 'RECEIPT_CONFIRMED' }),
    ).toBe(1);
  });
  it('carrier observation alone cannot establish the payout deadline', async () => {
    const f = await fixture();
    await fund(f);
    await service.settleOrder(f.order.id);
    expect(
      await f.db.getRepository(ShopSettlement).countBy({ orderId: f.order.id }),
    ).toBe(0);
  });
  it('accepts evidenced delivery earlier than first pickup observation when polling first sees delivered', async () => {
    const f = await fixture();
    await f.db
      .getRepository(Shipment)
      .update(f.shipment.id, { pickedObservedAt: new Date() });
    await expect(
      service.verifyDelivery(adminId, f.order.id, f.verification),
    ).resolves.toMatchObject({
      deliveryVerifiedAt: new Date(f.verification.deliveredAt),
    });
  });
  it('releases the full net once under concurrent retries and exposes matching finance totals', async () => {
    const f = await fixture();
    await fund(f);
    await service.verifyDelivery(adminId, f.order.id, f.verification);
    await Promise.all([
      service.settleOrder(f.order.id),
      service.settleOrder(f.order.id),
      service.confirmReceipt(f.buyer.id, f.order.id),
    ]);
    const rows = await f.db
      .getRepository(ShopSettlement)
      .findBy({ orderId: f.order.id });
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(194000);
    const view = await new ShopFinanceService(f.db).view(
      f.buyer.id,
      f.shop.id,
      {},
    );
    expect(view).toMatchObject({ held: 0, available: 194000, receivable: 0 });
    expect(view.settlements).toHaveLength(1);
  });
  it('unreceived and partial COD never release despite elapsed time', async () => {
    const f = await fixture();
    await fund(f, 'EVIDENCE', 100000);
    await service.verifyDelivery(adminId, f.order.id, f.verification);
    await service.settleOrder(f.order.id);
    expect(
      await f.db.getRepository(ShopSettlement).countBy({ orderId: f.order.id }),
    ).toBe(0);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('completed');
  });
  it.each([
    ['dispute', { status: 'dispute' }],
    ['return', { carrierReturnedAt: new Date() }],
    ['handover review', { handoverReviewRequired: true }],
    ['pending cancellation', { cancelState: 'PENDING' }],
    [
      'cancellation appeal',
      {
        cancelState: 'REJECTED',
        cancelReviewUntil: new Date(Date.now() + ms('1h')),
      },
    ],
  ])('blocks release for %s after funding', async (_name, changes) => {
    const f = await fixture();
    await fund(f);
    await service.verifyDelivery(adminId, f.order.id, f.verification);
    await f.db
      .getRepository(Order)
      .update(f.order.id, changes as Partial<Order>);
    await service.settleOrder(f.order.id);
    expect(
      await f.db.getRepository(ShopSettlement).countBy({ orderId: f.order.id }),
    ).toBe(0);
  });
  it('blocks unsafe carrier changes and altered funding snapshots', async () => {
    const f = await fixture();
    await fund(f);
    await service.verifyDelivery(adminId, f.order.id, f.verification);
    await f.db
      .getRepository(Shipment)
      .update(f.shipment.id, { reviewReason: 'CARRIER_DATA_MISMATCH' });
    await service.settleOrder(f.order.id);
    expect(
      await f.db.getRepository(ShopSettlement).countBy({ orderId: f.order.id }),
    ).toBe(0);
    await f.db
      .getRepository(Shipment)
      .update(f.shipment.id, { reviewReason: null });
    await f.db
      .getRepository(Order)
      .update(f.order.id, { commissionBasisPoints: 400 });
    await service.settleOrder(f.order.id);
    expect(
      await f.db.getRepository(ShopSettlement).countBy({ orderId: f.order.id }),
    ).toBe(0);
  });
  it('keeps simulation funding separate from evidenced delivery', async () => {
    const f = await fixture();
    await fund(f, 'SIMULATION');
    await service.verifyDelivery(adminId, f.order.id, f.verification);
    await service.settleOrder(f.order.id);
    expect(
      await f.db.getRepository(ShopSettlement).countBy({ orderId: f.order.id }),
    ).toBe(0);
  });
  it('verification rejects future dates and altered replays without moving the deadline', async () => {
    const f = await fixture();
    await expect(
      service.verifyDelivery(adminId, f.order.id, {
        ...f.verification,
        deliveredAt: new Date(Date.now() + ms('1h')).toISOString(),
      }),
    ).rejects.toThrow('Delivery timestamp or carrier evidence requires review');
    const first = await service.verifyDelivery(
      adminId,
      f.order.id,
      f.verification,
    );
    await service.verifyDelivery(adminId, f.order.id, f.verification);
    await expect(
      service.verifyDelivery(adminId, f.order.id, {
        ...f.verification,
        evidence: 'Changed',
      }),
    ).rejects.toThrow('Delivery verification is immutable; review required');
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .disputeDeadlineAt,
    ).toEqual(first.disputeDeadlineAt);
  });
  async function momoFixture(age = ms('73h')) {
    const f = await fixture(age);
    const checkout = await f.db.getRepository(Checkout).save({
      buyerId: f.buyer.id,
      requestId: randomUUID(),
      addressId: randomUUID(),
      requestedProductIds: f.order.items.map((item) => item.productId),
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
      paidAt: new Date(f.order.createdAt.getTime() + ms('1h')),
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
    await service.verifyDelivery(adminId, f.order.id, {
      ...f.verification,
      mode: 'SIMULATION',
    });
    return { ...f, payment };
  }
  it('holds verified MoMo Sandbox funds before 72h and releases only simulation balances later', async () => {
    const early = await momoFixture(ms('1h'));
    await service.settleOrder(early.order.id);
    const finance = new ShopFinanceService(early.db);
    expect(
      await finance.view(early.buyer.id, early.shop.id, { mode: 'SIMULATION' }),
    ).toMatchObject({ held: 194000, available: 0 });
    const due = await momoFixture();
    await service.settleOrder(due.order.id);
    expect(
      await finance.view(due.buyer.id, due.shop.id, { mode: 'SIMULATION' }),
    ).toMatchObject({ held: 0, available: 194000 });
    expect(await finance.view(due.buyer.id, due.shop.id, {})).toMatchObject({
      held: 0,
      available: 0,
    });
  });
  it.each([
    'payment state',
    'captured amount',
    'snapshot',
    'commission',
    'provider refund',
    'wallet refund',
  ])('blocks MoMo release with changed %s', async (change) => {
    const f = await momoFixture();
    if (change === 'payment state')
      await f.db
        .getRepository(PaymentAttempt)
        .update(f.payment.id, { state: 'UNKNOWN' });
    if (change === 'captured amount')
      await f.db
        .getRepository(PaymentAttempt)
        .update(f.payment.id, { capturedAmount: 1 });
    if (change === 'snapshot')
      await f.db.getRepository(Order).update(f.order.id, {
        items: [{ ...f.order.items[0], productId: randomUUID() }],
      });
    if (change === 'commission')
      await f.db
        .getRepository(Order)
        .update(f.order.id, { commissionBasisPoints: 0 });
    if (change === 'provider refund')
      await f.db.getRepository(PaymentRefund).save({
        paymentId: f.payment.id,
        providerTransId: f.payment.providerTransId!,
        amount: f.payment.amount,
        state: 'QUEUED',
        reason: 'LATE_OR_INVALID_CAPTURE',
        nextQueryAt: new Date(),
      });
    if (change === 'wallet refund')
      await f.db.getRepository(WalletCredit).save({
        orderId: f.order.id,
        userId: f.buyer.id,
        amount: f.order.total,
        reason: 'ORDER_CANCELLED',
      });
    await service.settleOrder(f.order.id);
    expect(
      await f.db.getRepository(ShopSettlement).countBy({ orderId: f.order.id }),
    ).toBe(0);
  });
  it('releases COD simulation only into the simulation balance', async () => {
    const f = await fixture();
    await fund(f, 'SIMULATION');
    await service.verifyDelivery(adminId, f.order.id, {
      ...f.verification,
      mode: 'SIMULATION',
    });
    await service.settleOrder(f.order.id);
    const finance = new ShopFinanceService(f.db);
    expect(
      await finance.view(f.buyer.id, f.shop.id, { mode: 'SIMULATION' }),
    ).toMatchObject({ available: 194000, held: 0 });
    expect(await finance.view(f.buyer.id, f.shop.id, {})).toMatchObject({
      available: 0,
      held: 0,
    });
  });
  it('late receipt after automatic completion records acknowledgement without crediting again', async () => {
    const f = await fixture();
    await fund(f);
    await service.verifyDelivery(adminId, f.order.id, f.verification);
    await service.settleOrder(f.order.id);
    expect(
      (await service.confirmReceipt(f.buyer.id, f.order.id)).receiptConfirmedAt,
    ).not.toBeNull();
    expect(
      await f.db.getRepository(ShopSettlement).countBy({ orderId: f.order.id }),
    ).toBe(1);
  });
  it('a refund of a duplicate capture does not block the valid original capture', async () => {
    const f = await momoFixture();
    await f.db.getRepository(PaymentRefund).save({
      paymentId: f.payment.id,
      providerTransId: randomUUID(),
      amount: f.payment.amount,
      state: 'COMPLETED',
      reason: 'LATE_OR_INVALID_CAPTURE',
      nextQueryAt: new Date(),
    });
    await service.settleOrder(f.order.id);
    expect(
      await f.db.getRepository(ShopSettlement).countBy({ orderId: f.order.id }),
    ).toBe(1);
  });
  it('rolls back release and completion together on a ledger write failure', async () => {
    const f = await fixture();
    await fund(f);
    await service.verifyDelivery(adminId, f.order.id, f.verification);
    await f.db.query(
      `ALTER TABLE shop_settlements ADD CONSTRAINT test_reject_settlement CHECK (amount < 0) NOT VALID`,
    );
    try {
      await expect(service.settleOrder(f.order.id)).rejects.toThrow(
        'test_reject_settlement',
      );
    } finally {
      await f.db.query(
        'ALTER TABLE shop_settlements DROP CONSTRAINT test_reject_settlement',
      );
    }
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('delivered');
    await service.settleOrder(f.order.id);
    expect(
      await f.db.getRepository(ShopSettlement).countBy({ orderId: f.order.id }),
    ).toBe(1);
    expect(
      await f.db
        .getRepository(ShopLedgerEntry)
        .countBy({ orderId: f.order.id }),
    ).toBe(1);
  });
  it('worker skips historical settlements and reaches due orders beyond a blocked batch', async () => {
    const f = await fixture();
    await fund(f);
    await service.verifyDelivery(adminId, f.order.id, f.verification);
    await service.settleOrder(f.order.id);
    const workerService = new OrderSettlementService(
      f.db,
      new OrderFundingService(),
    );
    const settledSpy = jest.spyOn(workerService, 'settleOrder');
    await workerService.settleDue();
    expect(settledSpy.mock.calls.map(([id]) => id)).not.toContain(f.order.id);
    settledSpy.mockRestore();
    // Blockers sort before every random fixture UUID, but a fresh keyset scan
    // must move past them instead of inspecting the same first page forever.
    await f.db.getRepository(Order).save(
      Array.from({ length: 101 }, (_, index) => ({
        ...f.order,
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        checkoutOrderId: randomUUID(),
        deliveryVerifiedAt: null,
        disputeDeadlineAt: null,
      })),
    );
    const target = await fixture();
    await fund(target);
    await service.verifyDelivery(adminId, target.order.id, target.verification);
    const scanner = new OrderSettlementService(f.db, new OrderFundingService());
    await scanner.settleDue();
    expect(
      await f.db
        .getRepository(ShopSettlement)
        .countBy({ orderId: target.order.id }),
    ).toBe(0);
    await scanner.settleDue();
    expect(
      await f.db
        .getRepository(ShopSettlement)
        .countBy({ orderId: target.order.id }),
    ).toBe(1);
  });
});
