import { ConflictException, Injectable } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { CHECKOUT_STATUS } from '@/modules/checkout/constants/checkout.constant';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import {
  COD_RECONCILIATION_STATUS,
  RECONCILIATION_MODE,
  SHOP_LEDGER_TYPE,
} from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { CodCollection } from '@/modules/cod-reconciliation/entities/cod-reconciliation.entity';
import { reconciliationMoney } from '@/modules/cod-reconciliation/policies/cod-reconciliation-money.policy';
import { orderFundingFingerprint } from '@/modules/cod-reconciliation/policies/order-fingerprint.policy';
import { PAYMENT_ATTEMPT_STATE } from '@/modules/payment/constants/payment.constant';
import {
  PaymentAttempt,
  PaymentRefund,
} from '@/modules/payment/entities/payment.entity';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';
import { WalletCredit } from '@/modules/wallet/entities/wallet.entity';

import { ORDER_PAYMENT_METHOD, ORDER_POLICY } from './constants/order.constant';
import { Order } from './entities/order.entity';

@Injectable()
export class OrderFundingService {
  async heldCredit(manager: EntityManager, order: Order, shipment: Shipment) {
    const refunded = await manager.existsBy(WalletCredit, {
      orderId: order.id,
    });
    if (refunded) return null;
    const money = reconciliationMoney(order);
    if (order.paymentMethod === ORDER_PAYMENT_METHOD.COD)
      return this.codCredit(manager, order, shipment, money.sellerNet);
    if (order.paymentMethod !== ORDER_PAYMENT_METHOD.MOMO) return null;
    return this.momoCredit(manager, order, money.sellerNet);
  }

  private async codCredit(
    manager: EntityManager,
    order: Order,
    shipment: Shipment,
    sellerNet: number,
  ) {
    const collection = await manager.findOneBy(CodCollection, {
      orderId: order.id,
    });
    if (!collection) return null;
    const hasFullReceipt =
      collection.cashReceived + collection.feeDeducted === order.total;
    const matchesSnapshot =
      collection.orderFingerprint === orderFundingFingerprint(order, shipment);
    const fundingVerified =
      collection.status === COD_RECONCILIATION_STATUS.FUNDED_HELD &&
      collection.reviewReason === null &&
      collection.collectedAmount === order.total &&
      collection.expectedAmount === order.total &&
      collection.shopId === order.shopId &&
      collection.shipmentId === shipment.id &&
      collection.waybillCode === shipment.orderCode &&
      collection.sellerNet === sellerNet &&
      hasFullReceipt &&
      matchesSnapshot;
    if (!fundingVerified) return null;
    const credit = await manager.findOneBy(ShopLedgerEntry, {
      orderId: order.id,
    });
    const creditMatches =
      credit &&
      credit.type === SHOP_LEDGER_TYPE.COD_FUNDED_HELD &&
      credit.collectionId === collection.id &&
      credit.shopId === order.shopId &&
      credit.mode === collection.mode &&
      credit.amount === sellerNet;
    return creditMatches ? credit : null;
  }

  private async momoCredit(
    manager: EntityManager,
    order: Order,
    sellerNet: number,
  ) {
    if (!order.paymentId) return null;
    const payment = await manager.findOneBy(PaymentAttempt, {
      id: order.paymentId,
    });
    if (!payment) return null;
    const checkout = await manager.findOneBy(Checkout, {
      id: payment.checkoutId,
    });
    const hasRefund = await manager.existsBy(PaymentRefund, {
      paymentId: payment.id,
      providerTransId: payment.providerTransId ?? '',
    });
    const snapshot = payment.orders.find(
      (row) => row.checkoutOrderId === order.checkoutOrderId,
    );
    const captureVerified =
      payment.state === PAYMENT_ATTEMPT_STATE.PAID &&
      payment.providerTransId &&
      payment.paidAt &&
      order.deliveryObservedAt &&
      payment.paidAt <= order.deliveryObservedAt &&
      payment.capturedAmount === payment.amount &&
      payment.amount ===
        payment.orders.reduce(
          (sum, row) => sum + row.subtotal + row.shippingFee,
          0,
        ) &&
      payment.buyerId === order.buyerId &&
      payment.checkoutId === order.checkoutId &&
      checkout?.status === CHECKOUT_STATUS.PAID &&
      checkout.buyerId === order.buyerId &&
      !hasRefund;
    const snapshotMatches =
      snapshot &&
      order.commissionBasisPoints ===
        ORDER_POLICY.DEFAULT_COMMISSION_BASIS_POINTS &&
      snapshot.shopId === order.shopId &&
      snapshot.subtotal === order.subtotal &&
      snapshot.shippingFee === order.shippingFee &&
      JSON.stringify(snapshot.items) === JSON.stringify(order.items);
    const canFund = captureVerified && snapshotMatches;
    if (!canFund) return null;
    let credit = await manager.findOneBy(ShopLedgerEntry, {
      orderId: order.id,
    });
    if (!credit) {
      // Current provider is MoMo Sandbox. Never expose its funds as real evidence.
      credit = await manager.save(
        ShopLedgerEntry,
        manager.create(ShopLedgerEntry, {
          orderId: order.id,
          shopId: order.shopId,
          collectionId: null,
          mode: RECONCILIATION_MODE.SIMULATION,
          type: SHOP_LEDGER_TYPE.MOMO_FUNDED_HELD,
          amount: sellerNet,
          actorId: null,
        }),
      );
    }
    const matchesCredit =
      credit.type === SHOP_LEDGER_TYPE.MOMO_FUNDED_HELD &&
      credit.mode === RECONCILIATION_MODE.SIMULATION &&
      credit.shopId === order.shopId &&
      credit.collectionId === null &&
      credit.amount === sellerNet;
    if (!matchesCredit)
      throw new ConflictException('Shop funding requires reconciliation');
    return credit;
  }
}
