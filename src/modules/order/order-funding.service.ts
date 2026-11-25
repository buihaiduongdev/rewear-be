import { ConflictException, Injectable } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import {
  COD_RECONCILIATION_STATUS,
  RECONCILIATION_MODE,
  SHOP_LEDGER_TYPE,
} from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { CodCollection } from '@/modules/cod-reconciliation/entities';
import { reconciliationMoney } from '@/modules/cod-reconciliation/policies/cod-reconciliation-money.policy';
import { orderFundingFingerprint } from '@/modules/cod-reconciliation/policies/order-fingerprint.policy';
import { verifiedOrderCoinDebit } from '@/modules/coins/core/verified-order-coin-debit';
import { verifiedPayosCapture } from '@/modules/payment/verified-payos-capture';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';
import { verifiedWalletCapture } from '@/modules/wallet/checkout/verified-wallet-capture';
import { WalletCredit } from '@/modules/wallet/entities';

import { ORDER_PAYMENT_METHOD, ORDER_POLICY } from './constants/order.constant';
import { Order } from './entities';

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
    if (order.paymentMethod === ORDER_PAYMENT_METHOD.WALLET)
      return this.walletCredit(manager, order, money.sellerNet);
    if (order.paymentMethod !== ORDER_PAYMENT_METHOD.PAYOS) return null;
    return this.payosCredit(manager, order, money.sellerNet);
  }

  private async walletCredit(
    manager: EntityManager,
    order: Order,
    sellerNet: number,
  ) {
    const debit = await verifiedWalletCapture(manager, order);
    if (!debit || !(await verifiedOrderCoinDebit(manager, order, debit.mode)))
      return null;
    if (
      !debit ||
      !order.deliveryObservedAt ||
      debit.createdAt > order.deliveryObservedAt ||
      order.commissionBasisPoints !==
        ORDER_POLICY.DEFAULT_COMMISSION_BASIS_POINTS
    )
      return null;
    let credit = await manager.findOneBy(ShopLedgerEntry, {
      orderId: order.id,
    });
    if (!credit)
      credit = await manager.save(
        ShopLedgerEntry,
        manager.create(ShopLedgerEntry, {
          orderId: order.id,
          shopId: order.shopId,
          collectionId: null,
          mode: debit.mode,
          type: SHOP_LEDGER_TYPE.WALLET_FUNDED_HELD,
          amount: sellerNet,
          actorId: null,
        }),
      );
    if (
      credit.type !== SHOP_LEDGER_TYPE.WALLET_FUNDED_HELD ||
      credit.mode !== debit.mode ||
      credit.shopId !== order.shopId ||
      credit.collectionId !== null ||
      credit.amount !== sellerNet
    )
      throw new ConflictException(
        'Shop wallet funding requires reconciliation',
      );
    return credit;
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
    if (!(await verifiedOrderCoinDebit(manager, order, collection.mode)))
      return null;
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

  private async payosCredit(
    manager: EntityManager,
    order: Order,
    sellerNet: number,
  ) {
    if (!order.deliveryObservedAt) return null;
    const payment = await verifiedPayosCapture(manager, order);
    if (
      !payment ||
      !payment.paidAt ||
      payment.paidAt > order.deliveryObservedAt
    )
      return null;
    if (
      !(await verifiedOrderCoinDebit(
        manager,
        order,
        RECONCILIATION_MODE.SIMULATION,
      ))
    )
      return null;
    let credit = await manager.findOneBy(ShopLedgerEntry, {
      orderId: order.id,
    });
    if (!credit) {
      // PayOS sandbox/testing simulation ledger entry.
      credit = await manager.save(
        ShopLedgerEntry,
        manager.create(ShopLedgerEntry, {
          orderId: order.id,
          shopId: order.shopId,
          collectionId: null,
          mode: RECONCILIATION_MODE.SIMULATION,
          type: SHOP_LEDGER_TYPE.PAYOS_FUNDED_HELD,
          amount: sellerNet,
          actorId: null,
        }),
      );
    }
    const matchesCredit =
      credit.type === SHOP_LEDGER_TYPE.PAYOS_FUNDED_HELD &&
      credit.mode === RECONCILIATION_MODE.SIMULATION &&
      credit.shopId === order.shopId &&
      credit.collectionId === null &&
      credit.amount === sellerNet;
    if (!matchesCredit)
      throw new ConflictException('Shop funding requires reconciliation');
    return credit;
  }
}
