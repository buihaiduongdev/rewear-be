import { ConflictException, Injectable } from '@nestjs/common';

import { EntityManager, Not } from 'typeorm';

import { reconciliationMoney } from '@/modules/cod-reconciliation/cod-reconciliation.service';
import {
  COD_RECONCILIATION_STATUS,
  RECONCILIATION_MODE,
  SHOP_LEDGER_TYPE,
} from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { CodCollection } from '@/modules/cod-reconciliation/entities';
import { verifiedOrderCoinDebit } from '@/modules/coins/core/verified-order-coin-debit';
import { verifiedPayosCapture } from '@/modules/payment/verified-payos-capture';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';
import { SHOP_LEDGER_ENTRY_TYPE } from '@/modules/shop-finance/payouts/constants/payout.constant';
import { verifiedWalletCapture } from '@/modules/wallet/checkout/verified-wallet-capture';
import { WalletCredit } from '@/modules/wallet/entities';

import { ORDER_PAYMENT_METHOD, ORDER_POLICY } from './constants/order.constant';
import { Order } from './entities';

export async function resolveOrderHeldCredit(
  manager: EntityManager,
  order: Order,
  shipment: Shipment,
) {
  if (manager.queryRunner?.isTransactionActive && manager.findOne) {
    await manager.findOne(Order, {
      where: { id: order.id },
      lock: { mode: 'pessimistic_write' },
    });
  }
  const refunded = await manager.existsBy(WalletCredit, {
    orderId: order.id,
  });
  if (refunded) return null;
  const money = reconciliationMoney(order);
  if (order.paymentMethod === ORDER_PAYMENT_METHOD.COD)
    return resolveCodCredit(manager, order, shipment, money.sellerNet);
  if (order.paymentMethod === ORDER_PAYMENT_METHOD.WALLET)
    return resolveWalletCredit(manager, order, money.sellerNet);
  if (order.paymentMethod !== ORDER_PAYMENT_METHOD.PAYOS) return null;
  return resolvePayosCredit(manager, order, money.sellerNet);
}

async function resolveWalletCredit(
  manager: EntityManager,
  order: Order,
  sellerNet: number,
) {
  const debit = await verifiedWalletCapture(manager, order);
  if (!debit || !(await verifiedOrderCoinDebit(manager, order, debit.mode)))
    return null;
  if (
    !order.deliveryObservedAt ||
    debit.createdAt > order.deliveryObservedAt ||
    order.commissionBasisPoints !== ORDER_POLICY.DEFAULT_COMMISSION_BASIS_POINTS
  )
    return null;
  let credit = await manager.findOneBy(ShopLedgerEntry, {
    orderId: order.id,
    type: Not(SHOP_LEDGER_ENTRY_TYPE.COD_SHIPPING_DEBIT),
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
    throw new ConflictException('Shop wallet funding requires reconciliation');
  return credit;
}

async function resolveCodCredit(
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
  const fundingVerified =
    collection.status === COD_RECONCILIATION_STATUS.FUNDED_HELD &&
    collection.reviewReason === null &&
    collection.collectedAmount === order.total &&
    collection.expectedAmount === order.total &&
    collection.shopId === order.shopId &&
    collection.shipmentId === shipment.id &&
    collection.waybillCode === shipment.orderCode &&
    collection.sellerNet === sellerNet &&
    hasFullReceipt;
  if (!fundingVerified) return null;
  const credit = await manager.findOneBy(ShopLedgerEntry, {
    orderId: order.id,
    type: Not(SHOP_LEDGER_ENTRY_TYPE.COD_SHIPPING_DEBIT),
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

async function resolvePayosCredit(
  manager: EntityManager,
  order: Order,
  sellerNet: number,
) {
  if (!order.deliveryObservedAt) return null;
  const payment = await verifiedPayosCapture(manager, order);
  if (!payment || !payment.paidAt || payment.paidAt > order.deliveryObservedAt)
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
    type: Not(SHOP_LEDGER_ENTRY_TYPE.COD_SHIPPING_DEBIT),
  });
  if (!credit) {
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

@Injectable()
export class OrderFundingService {
  heldCredit(manager: EntityManager, order: Order, shipment: Shipment) {
    return resolveOrderHeldCredit(manager, order, shipment);
  }
}
