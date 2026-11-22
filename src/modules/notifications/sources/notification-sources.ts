import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { CoinRewardAdjustmentNotice } from '@/modules/coins/rewards/entities/coin-reward.entity';
import { DISPUTE_NOTICE_AUDIENCE } from '@/modules/dispute/constants/dispute.constant';
import {
  DisputeCase,
  DisputeIssue,
  DisputeNotice,
} from '@/modules/dispute/entities/dispute.entity';
import { FEE_PARTY } from '@/modules/fees/constants/fee.constant';
import { FeeAssessment, FeeNotice } from '@/modules/fees/entities/fee.entity';
import { ORDER_EVENT_ACTION } from '@/modules/order/constants/order.constant';
import { Order, OrderEvent } from '@/modules/order/entities/order.entity';
import {
  ShopRating,
  ShopRatingNotice,
} from '@/modules/ratings/entities/shop-rating.entity';
import { FulfillmentNotice } from '@/modules/shipment/entities/late-handover.entity';
import { ShopInvitation } from '@/modules/shop/entities/shop-invitation.entity';

import {
  NOTIFICATION_KIND,
  NOTIFICATION_TARGET,
} from '../constants/notification.constant';
import type { NotificationRecipient } from '../types/notification.type';
import {
  adminRecipients,
  personalRecipient,
  shopRecipients,
} from './notification-recipients';
import type { NotificationSource } from './notification-source.types';
import { orderNotificationMode } from './order-notification-mode';

const dispute: NotificationSource<DisputeNotice> = {
  entity: DisputeNotice,
  prefix: 'dispute:',
  build: async (manager, row) => {
    const issue = await manager.findOneByOrFail(DisputeIssue, {
      id: row.issueId,
    });
    const dispute = await manager.findOneByOrFail(DisputeCase, {
      id: issue.caseId,
    });
    let recipients: NotificationRecipient[];
    if (row.audience === DISPUTE_NOTICE_AUDIENCE.BUYER)
      recipients = [personalRecipient(dispute.buyerId)];
    else if (row.audience === DISPUTE_NOTICE_AUDIENCE.SHOP)
      recipients = await shopRecipients(
        manager,
        dispute.shopId,
        SHOP_PERMISSIONS.SHOP_OWNER,
      );
    else recipients = await adminRecipients(manager);
    return {
      kind: NOTIFICATION_KIND.DISPUTE,
      sourceId:
        row.audience === DISPUTE_NOTICE_AUDIENCE.ADMIN
          ? dispute.id
          : dispute.orderId,
      targetType:
        row.audience === DISPUTE_NOTICE_AUDIENCE.ADMIN
          ? NOTIFICATION_TARGET.DISPUTE_CASE
          : NOTIFICATION_TARGET.ORDER,
      title: 'Cập nhật khiếu nại',
      body: 'Hồ sơ khiếu nại có cập nhật. Mở hồ sơ để xem nội dung và thời hạn xử lý.',
      mode: await orderNotificationMode(
        manager,
        await manager.findOneByOrFail(Order, { id: dispute.orderId }),
      ),
      recipients,
    };
  },
};
const fee: NotificationSource<FeeNotice> = {
  entity: FeeNotice,
  prefix: 'fee:',
  build: async (manager, row) => {
    const fee = await manager.findOneByOrFail(FeeAssessment, { id: row.feeId });
    const recipients =
      fee.party === FEE_PARTY.SHOP
        ? (
            await shopRecipients(
              manager,
              fee.shopId,
              SHOP_PERMISSIONS.SHOP_OWNER,
            )
          ).filter((recipient) => recipient.userId === row.recipientId)
        : [personalRecipient(row.recipientId)];
    return {
      kind: NOTIFICATION_KIND.FEE,
      targetType: NOTIFICATION_TARGET.FEE,
      sourceId: row.feeId,
      title: 'Cập nhật khoản phí',
      body: 'Có cập nhật khoản phí cần xem xét. Mở chi tiết để kiểm tra số tiền, căn cứ và thời hạn.',
      mode: fee.mode,
      recipients,
    };
  },
};
const fulfillment: NotificationSource<FulfillmentNotice> = {
  entity: FulfillmentNotice,
  prefix: 'fulfillment:',
  build: async (manager, row) => {
    const order = await manager.findOneByOrFail(Order, { id: row.orderId });
    const recipients =
      row.recipientId === order.buyerId
        ? [personalRecipient(row.recipientId)]
        : (
            await shopRecipients(
              manager,
              order.shopId,
              SHOP_PERMISSIONS.ORDER_VIEW,
            )
          ).filter((recipient) => recipient.userId === row.recipientId);
    return {
      kind: NOTIFICATION_KIND.FULFILLMENT,
      targetType: NOTIFICATION_TARGET.ORDER,
      sourceId: order.id,
      title: 'Cập nhật giao hàng',
      body: 'Đơn hàng có cập nhật vận chuyển. Mở đơn để xem tình trạng và việc cần xử lý.',
      mode: await orderNotificationMode(manager, order),
      recipients,
    };
  },
};
const coins: NotificationSource<CoinRewardAdjustmentNotice> = {
  entity: CoinRewardAdjustmentNotice,
  prefix: 'coin-adjustment:',
  build: async (_manager, row) => ({
    kind: NOTIFICATION_KIND.COIN_ADJUSTMENT,
    targetType: NOTIFICATION_TARGET.COIN_HISTORY,
    sourceId: row.orderId,
    title: 'Điều chỉnh xu thưởng',
    body: 'Xu thưởng của đơn hàng được điều chỉnh theo khoản hoàn tiền đã xác nhận. Mở lịch sử xu để xem căn cứ.',
    mode: row.mode,
    recipients: [personalRecipient(row.buyerId)],
  }),
};
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
  build: async (manager, row) => {
    return {
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
    };
  },
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
            ).filter((recipient) => recipient.userId !== order.buyerId),
          ],
    };
  },
};

export const notificationSources = [
  dispute,
  fee,
  fulfillment,
  coins,
  rating,
  order,
  orderEvent,
  invitation,
] as NotificationSource[];
