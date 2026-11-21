import { randomUUID } from 'node:crypto';

import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund.entity';
import {
  DisputeCase,
  DisputeIssue,
} from '@/modules/dispute/entities/dispute.entity';
import { Order } from '@/modules/order/entities/order.entity';
import { PaymentAttempt } from '@/modules/payment/entities/payment.entity';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';
import { ShopSettlement } from '@/modules/shop-finance/entities/shop-settlement.entity';
import {
  encumberedOrderSettlement,
  readPayoutSources,
} from '@/modules/shop-finance/payout-sources';
import {
  ShopPayout,
  ShopPayoutAllocation,
} from '@/modules/shop-finance/payouts/entities/shop-payout.entity';
import {
  WalletAccount,
  WalletCredit,
} from '@/modules/wallet/entities/wallet.entity';
import { verifiedWalletFunds } from '@/modules/wallet/verified-wallet-funds';
import { WalletService } from '@/modules/wallet/wallet.service';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Wallet and payout source accounting (PostgreSQL)', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => database?.destroy());
  it('isolates new sandbox cancellations and leaves ambiguous legacy balances quarantined', async () => {
    const db = database.dataSource,
      f = await adjudicationFixture(db);
    const checkout = await db.getRepository(Checkout).save({
      buyerId: f.buyer.id,
      requestId: randomUUID(),
      addressId: randomUUID(),
      requestedProductIds: f.order.items.map((row) => row.productId),
      address: f.order.address,
      status: 'PAID',
      expiresAt: new Date(),
      removedItems: [],
    });
    const payment = await db.getRepository(PaymentAttempt).save({
      checkoutId: checkout.id,
      buyerId: f.buyer.id,
      requestId: randomUUID(),
      state: 'PAID',
      amount: f.order.total,
      capturedAmount: f.order.total,
      providerTransId: randomUUID(),
      paidAt: new Date(f.order.deliveryObservedAt!.getTime() - 1000),
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
    Object.assign(f.order, { paymentMethod: 'MOMO' });
    f.order.paymentId = payment.id;
    f.order.checkoutId = checkout.id;
    await db.getRepository(Order).save(f.order);
    const wallet = new WalletService(db);
    const persistedOrder = await db
      .getRepository(Order)
      .findOneByOrFail({ id: f.order.id });
    await db.transaction((m) => wallet.creditCancellation(m, persistedOrder));
    const account = await db
      .getRepository(WalletAccount)
      .findOneByOrFail({ userId: f.buyer.id });
    expect(account).toMatchObject({
      balance: 0,
      simulationBalance: f.order.total,
    });
    expect(
      await verifiedWalletFunds(db.manager, f.buyer.id, 'SIMULATION'),
    ).toMatchObject({ spendable: f.order.total, quarantined: 0 });
    await db
      .getRepository(WalletCredit)
      .update({ orderId: f.order.id }, { mode: null });
    await db
      .getRepository(WalletAccount)
      .update(account.id, { balance: 30, simulationBalance: f.order.total });
    expect(
      await verifiedWalletFunds(db.manager, f.buyer.id, 'SIMULATION'),
    ).toMatchObject({ spendable: 0, quarantined: f.order.total });
    expect(
      await verifiedWalletFunds(db.manager, f.buyer.id, 'EVIDENCE'),
    ).toMatchObject({ spendable: 0, quarantined: 30 });
  });
  async function settlementFixture() {
    const db = database.dataSource,
      f = await adjudicationFixture(db);
    await db
      .getRepository(DisputeIssue)
      .update(f.issue.id, { status: 'RESOLVED_REFUND' });
    await db.getRepository(DisputeCase).update(f.row.id, { state: 'CLOSED' });
    const credit = await db.getRepository(ShopLedgerEntry).save({
      orderId: f.order.id,
      shopId: f.shop.id,
      collectionId: null,
      mode: 'EVIDENCE',
      type: 'COD_FUNDED_HELD',
      amount: 97001,
      actorId: null,
    });
    const settlement = await db.getRepository(ShopSettlement).save({
      orderId: f.order.id,
      shopId: f.shop.id,
      creditId: credit.id,
      mode: 'EVIDENCE',
      amount: 97001,
      refundDebit: 0,
    });
    return { ...f, db, credit, settlement };
  }
  it('reserves exact origins, restores cancelled sources, and blocks reopened issues', async () => {
    const f = await settlementFixture();
    const payout = await f.db.getRepository(ShopPayout).save({
      shopId: f.shop.id,
      ownerId: f.owner.id,
      mode: 'EVIDENCE',
      status: 'PENDING',
      amount: 60000,
      bankAccountId: randomUUID(),
      requestId: randomUUID(),
      recipientSnapshot: {},
    });
    await f.db.getRepository(ShopPayoutAllocation).save({
      payoutId: payout.id,
      kind: 'SETTLEMENT',
      sourceId: f.settlement.id,
      orderId: f.order.id,
      mode: 'EVIDENCE',
      amount: 60000,
    });
    expect(
      await readPayoutSources(f.db.manager, f.shop.id, 'EVIDENCE'),
    ).toMatchObject({ available: 37001, payoutLocked: 60000, paidOut: 0 });
    expect(
      (await readPayoutSources(f.db.manager, f.shop.id, 'EVIDENCE', payout.id))
        .available,
    ).toBe(97001);
    expect(
      await encumberedOrderSettlement(f.db.manager, f.order.id, 'EVIDENCE'),
    ).toBe(60000);
    await f.db
      .getRepository(DisputeIssue)
      .update(f.issue.id, { status: 'ACTIVE' });
    expect(
      await readPayoutSources(f.db.manager, f.shop.id, 'EVIDENCE'),
    ).toMatchObject({ available: 0, heldShortfall: 60000, reviewHeld: 97001 });
    await f.db
      .getRepository(ShopPayout)
      .update(payout.id, { status: 'CANCELLED' });
    expect(
      await encumberedOrderSettlement(f.db.manager, f.order.id, 'EVIDENCE'),
    ).toBe(0);
  });
  it('records debt against a paid source while leaving another orders settlement intact', async () => {
    const f = await settlementFixture();
    const payout = await f.db.getRepository(ShopPayout).save({
      shopId: f.shop.id,
      ownerId: f.owner.id,
      mode: 'EVIDENCE',
      status: 'SUCCEEDED',
      amount: 60000,
      bankAccountId: randomUUID(),
      requestId: randomUUID(),
      recipientSnapshot: {},
    });
    await f.db.getRepository(ShopPayoutAllocation).save({
      payoutId: payout.id,
      kind: 'SETTLEMENT',
      sourceId: f.settlement.id,
      orderId: f.order.id,
      mode: 'EVIDENCE',
      amount: 60000,
    });
    // A correction of already-recorded settlement deduction avoids inventing refund proof.
    await f.db
      .getRepository(ShopSettlement)
      .update(f.settlement.id, { amount: 10000 });
    const other = await f.db.getRepository(Order).save(
      f.db.getRepository(Order).create({
        ...f.order,
        id: randomUUID(),
        checkoutOrderId: randomUUID(),
      }),
    );
    const otherCredit = await f.db.getRepository(ShopLedgerEntry).save({
      orderId: other.id,
      shopId: f.shop.id,
      collectionId: null,
      mode: 'EVIDENCE',
      type: 'COD_FUNDED_HELD',
      amount: 777,
      actorId: null,
    });
    await f.db.getRepository(ShopSettlement).save({
      orderId: other.id,
      shopId: f.shop.id,
      creditId: otherCredit.id,
      mode: 'EVIDENCE',
      amount: 777,
      refundDebit: 0,
    });
    expect(
      await readPayoutSources(f.db.manager, f.shop.id, 'EVIDENCE'),
    ).toMatchObject({
      available: 777,
      paidOutDebt: 50000,
      paidOut: 60000,
      heldShortfall: 0,
    });
    expect(
      (await readPayoutSources(f.db.manager, f.shop.id, 'SIMULATION'))
        .available,
    ).toBe(0);
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(0);
  });
});
