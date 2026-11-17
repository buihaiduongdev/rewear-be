import { createHash } from 'node:crypto';

import type { Order } from '@/modules/order/entities/order.entity';
import type { Shipment } from '@/modules/shipment/entities/shipment.entity';

export function orderFundingFingerprint(order: Order, shipment: Shipment) {
  const snapshot = {
    shopId: order.shopId,
    method: order.paymentMethod,
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    total: order.total,
    rate: order.commissionBasisPoints,
    items: order.items
      .map((item) => ({ productId: item.productId, price: item.price }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
    shipmentId: shipment.id,
    waybill: shipment.orderCode,
    codAmount: shipment.codAmount,
  };
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}
