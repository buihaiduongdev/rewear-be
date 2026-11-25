import type { EntityManager, EntityTarget } from 'typeorm';

import type { BaseEntity } from '@/common/entities';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { CodCollection } from '@/modules/cod-reconciliation/entities';
import {
  ORDER_EVENT_ACTION,
  ORDER_PAYMENT_METHOD,
} from '@/modules/order/constants/order.constant';
import { Order, OrderEvent } from '@/modules/order/entities';
import { ShopRating, ShopRatingNotice } from '@/modules/ratings/entities';
import { ShopInvitation } from '@/modules/shop/entities/shop-invitation.entity';
import { WalletDebit } from '@/modules/wallet/checkout/entities';

import {
  NOTIFICATION_KIND,
  NOTIFICATION_TARGET,
} from '../constants/notification.constant';
import type { NotificationInput } from '../schemas/notification.schema';
import { personalRecipient, shopRecipients } from './notification-recipients';

export type NotificationSource<T extends BaseEntity = BaseEntity> = {
  entity: EntityTarget<T>;
  prefix: string;
  build(
    manager: EntityManager,
    row: T,
  ): Promise<Omit<NotificationInput, 'key' | 'email'>>;
  importantEmail?: boolean;
};

async function orderNotificationMode(manager: EntityManager, order: Order) {
  if (order.paymentMethod === ORDER_PAYMENT_METHOD.PAYOS)
    return RECONCILIATION_MODE.SIMULATION;
  if (order.walletDebitId)
    return (
      (await manager.findOneBy(WalletDebit, { id: order.walletDebitId }))
        ?.mode ?? null
    );
  return (
    (await manager.findOneBy(CodCollection, { orderId: order.id }))?.mode ??
    order.coinMode ??
    null
  );
}

const rating: NotificationSource<ShopRatingNotice> = {
  entity: ShopRatingNotice,
  prefix: 'rating-edit:',
  build: async (manager, row) => ({
    kind: NOTIFICATION_KIND.RATING_EDIT,
    targetType: NOTIFICATION_TARGET.RATING,
    sourceId: row.ratingId,
    title: 'Đánh giá Shop được cập nhật',
    body: 'Người mua đã sửa đánh giá. Mở đánh giá để xem và phản hồi.',
    mode: (await manager.findOneByOrFail(ShopRating, { id: row.ratingId }))
      .mode,
    recipients: await shopRecipients(
      manager,
      row.shopId,
      SHOP_PERMISSIONS.RATING_REPLY,
    ),
  }),
};

const order: NotificationSource<Order> = {
  entity: Order,
  prefix: 'order-created:',
  importantEmail: true,
  build: async (manager, row) => ({
    kind: NOTIFICATION_KIND.ORDER_CREATED,
    targetType: NOTIFICATION_TARGET.ORDER,
    sourceId: row.id,
    title: 'Đơn hàng mới',
    body: 'Đơn hàng đã được tạo. Mở đơn hàng để xem thông tin và thời hạn xác nhận.',
    mode: await orderNotificationMode(manager, row),
    recipients: [
      personalRecipient(row.buyerId),
      ...(
        await shopRecipients(manager, row.shopId, SHOP_PERMISSIONS.ORDER_VIEW)
      ).filter((recipient) => recipient.userId !== row.buyerId),
    ],
  }),
};

const invitation: NotificationSource<ShopInvitation> = {
  entity: ShopInvitation,
  prefix: 'shop-invitation:',
  importantEmail: true,
  build: async (_manager, row) => ({
    kind: NOTIFICATION_KIND.SHOP_INVITATION,
    targetType: NOTIFICATION_TARGET.SHOP_INVITATION,
    sourceId: row.id,
    title: 'Lời mời tham gia Shop',
    body: 'Bạn nhận được lời mời tham gia Shop. Mở Rewear để xem vai trò và thời hạn lời mời.',
    mode: null,
    recipients: [personalRecipient(row.userId)],
  }),
};

const orderEvent: NotificationSource<OrderEvent> = {
  entity: OrderEvent,
  prefix: 'order-event:',
  build: async (manager, row) => {
    const order = await manager.findOneByOrFail(Order, { id: row.orderId });
    const initial = (
      [ORDER_EVENT_ACTION.PAID, ORDER_EVENT_ACTION.PLACED] as readonly string[]
    ).includes(row.action);
    return {
      kind: NOTIFICATION_KIND.ORDER_UPDATED,
      targetType: NOTIFICATION_TARGET.ORDER,
      sourceId: order.id,
      title: 'Cập nhật đơn hàng',
      body: 'Đơn hàng có cập nhật trạng thái. Mở đơn hàng để xem tình trạng hiện tại và việc cần xử lý.',
      mode: await orderNotificationMode(manager, order),
      recipients: initial
        ? []
        : [
            personalRecipient(order.buyerId),
            ...(
              await shopRecipients(
                manager,
                order.shopId,
                SHOP_PERMISSIONS.ORDER_VIEW,
              )
            ).filter((recipient) => recipient.userId !== row.buyerId),
          ],
    };
  },
};

export const notificationSources = [
  rating,
  order,
  orderEvent,
  invitation,
] as NotificationSource[];
