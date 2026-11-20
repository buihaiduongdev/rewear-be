import { EntityManager } from 'typeorm';

import {
  COD_RECONCILIATION_STATUS,
  RECONCILIATION_MODE,
  RECONCILIATION_REVIEW_REASON,
  SHOP_LEDGER_TYPE,
} from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { CodCollection } from '@/modules/cod-reconciliation/entities/cod-reconciliation.entity';
import { reconciliationMoney } from '@/modules/cod-reconciliation/policies/cod-reconciliation-money.policy';
import { orderFundingFingerprint } from '@/modules/cod-reconciliation/policies/order-fingerprint.policy';
import { ORDER_PAYMENT_METHOD } from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities/order.entity';
import { OrderFundingService } from '@/modules/order/order-funding.service';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';
import { WalletCredit } from '@/modules/wallet/entities/wallet.entity';

/** Only server-verified payment data establishes a refund source. Delivery alone never does. */
export async function refundFunding(
  manager: EntityManager,
  order: Order,
  now: Date,
) {
  const cancelledRefund = await manager.existsBy(WalletCredit, {
    orderId: order.id,
  });
  if (cancelledRefund) return null;
  const shipment = await manager.findOneBy(Shipment, { orderId: order.id });
  if (!shipment) return null;
  const money = reconciliationMoney(order);
  if (
    order.paymentMethod === ORDER_PAYMENT_METHOD.MOMO ||
    order.paymentMethod === ORDER_PAYMENT_METHOD.WALLET
  ) {
    const credit = await new OrderFundingService().heldCredit(
      manager,
      order,
      shipment,
    );
    return credit
      ? {
          mode: credit.mode,
          verifiedAt: credit.createdAt,
          funded: true,
          itemFundsAvailable: order.subtotal,
        }
      : null;
  }
  if (order.paymentMethod !== ORDER_PAYMENT_METHOD.COD) return null;
  const collection = await manager.findOneBy(CodCollection, {
    orderId: order.id,
  });
  if (!collection) return null;
  const reviewAcceptable =
    collection.reviewReason === null ||
    collection.reviewReason ===
      RECONCILIATION_REVIEW_REASON.CARRIER_OR_ORDER_REQUIRES_REVIEW;
  const proofMatches =
    collection.collectedAmount === order.total &&
    collection.expectedAmount === order.total &&
    collection.shopId === order.shopId &&
    collection.shipmentId === shipment.id &&
    collection.waybillCode === shipment.orderCode &&
    collection.orderFingerprint === orderFundingFingerprint(order, shipment) &&
    collection.gross === money.gross &&
    collection.commission === money.commission &&
    collection.sellerNet === money.sellerNet &&
    collection.collectedAt <= now &&
    Object.values(RECONCILIATION_MODE).includes(collection.mode) &&
    reviewAcceptable;
  if (!proofMatches) return null;
  const credit = await manager.findOneBy(ShopLedgerEntry, {
    orderId: order.id,
  });
  const creditMatches =
    credit?.mode === collection.mode &&
    credit.amount === money.sellerNet &&
    credit.shopId === order.shopId &&
    credit.type === SHOP_LEDGER_TYPE.COD_FUNDED_HELD &&
    credit.collectionId === collection.id &&
    collection.cashReceived + collection.feeDeducted === order.total;
  if (credit && !creditMatches) return null;
  const funded =
    collection.status === COD_RECONCILIATION_STATUS.FUNDED_HELD &&
    creditMatches;
  const reservedShipping = Math.max(
    0,
    order.shippingFee - collection.feeDeducted,
  );
  const itemFundsAvailable = Math.min(
    order.subtotal,
    Math.max(0, collection.cashReceived - reservedShipping),
  );
  return {
    mode: collection.mode,
    verifiedAt: collection.createdAt,
    funded,
    itemFundsAvailable,
  };
}
