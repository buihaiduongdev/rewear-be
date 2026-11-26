import type { EntityManager } from 'typeorm';

import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import {
  EVENT_TYPES,
  type TEventType,
} from '@/modules/event/constants/event-type.constant';
import type { TOutboxEventPayloadMap } from '@/modules/event/types/outbox-event.type';
import { ORDER_EVENT_ACTION } from '@/modules/order/constants/order.constant';

import {
  resolveAdminRecipients,
  resolveShopRecipients,
} from './notification-recipients';

export type TDomainEventJobData<K extends TEventType = TEventType> = {
  eventId: string;
  eventType: K;
  resourceId: string;
  payload: TOutboxEventPayloadMap[K];
};

export type TNotificationDraft = {
  recipientId: string;
  type: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  sendEmail?: boolean;
};

export async function buildNotificationDrafts(
  manager: EntityManager,
  data: TDomainEventJobData,
): Promise<TNotificationDraft[]> {
  switch (data.eventType) {
    case EVENT_TYPES.ORDER_CREATED: {
      const payload =
        data.payload as TOutboxEventPayloadMap[typeof EVENT_TYPES.ORDER_CREATED];
      const shopUsers = (
        await resolveShopRecipients(
          manager,
          payload.shopId,
          SHOP_PERMISSIONS.ORDER_VIEW,
        )
      ).filter((id) => id !== payload.buyerId);
      return [payload.buyerId, ...shopUsers].map((recipientId) => ({
        recipientId,
        type: EVENT_TYPES.ORDER_CREATED,
        title: 'New order',
        body: 'Your order has been created. Open the order to view details and confirmation deadline.',
        entityType: 'order',
        entityId: payload.orderId,
        sendEmail: true,
      }));
    }

    case EVENT_TYPES.ORDER_UPDATED: {
      const payload =
        data.payload as TOutboxEventPayloadMap[typeof EVENT_TYPES.ORDER_UPDATED];
      const isInitial = (
        [
          ORDER_EVENT_ACTION.PAID,
          ORDER_EVENT_ACTION.PLACED,
        ] as readonly string[]
      ).includes(payload.action);
      if (isInitial) {
        return [];
      }
      const shopUsers = (
        await resolveShopRecipients(
          manager,
          payload.shopId,
          SHOP_PERMISSIONS.ORDER_VIEW,
        )
      ).filter((id) => id !== payload.buyerId);
      return [payload.buyerId, ...shopUsers].map((recipientId) => ({
        recipientId,
        type: EVENT_TYPES.ORDER_UPDATED,
        title: 'Order update',
        body: 'Your order status has been updated. Open the order to view its current status and next steps.',
        entityType: 'order',
        entityId: payload.orderId,
      }));
    }

    case EVENT_TYPES.SHOP_APPLICATION_DECIDED: {
      const payload =
        data.payload as TOutboxEventPayloadMap[typeof EVENT_TYPES.SHOP_APPLICATION_DECIDED];
      const drafts: TNotificationDraft[] = [
        {
          recipientId: payload.applicantId,
          type: EVENT_TYPES.SHOP_APPLICATION_DECIDED,
          title: 'Shop application update',
          body: 'Your shop application has an update. Sign in to review the status and next steps.',
          entityType: 'shop_application',
          entityId: payload.applicationId,
          sendEmail: payload.sendEmail,
        },
      ];
      const admins = (await resolveAdminRecipients(manager)).filter(
        (id) => id !== payload.applicantId,
      );
      for (const adminId of admins) {
        drafts.push({
          recipientId: adminId,
          type: EVENT_TYPES.SHOP_APPLICATION_DECIDED,
          title: 'Shop review update',
          body: 'A shop application has an update in the review queue.',
          entityType: 'shop_application',
          entityId: payload.applicationId,
        });
      }
      return drafts;
    }

    case EVENT_TYPES.SHOP_IDENTITY_RENEWAL: {
      const payload =
        data.payload as TOutboxEventPayloadMap[typeof EVENT_TYPES.SHOP_IDENTITY_RENEWAL];
      return [
        {
          recipientId: payload.applicantId,
          type: EVENT_TYPES.SHOP_IDENTITY_RENEWAL,
          title:
            payload.stage === 'paused'
              ? 'Shop new orders paused'
              : 'Identity document grace period ending soon',
          body: 'Sign in and open your shop profile to update your identity documents. Existing orders continue as normal.',
          entityType: 'shop_application',
          entityId: payload.applicationId,
          sendEmail: true,
        },
      ];
    }

    case EVENT_TYPES.PRODUCT_REVIEW_DECIDED: {
      const payload =
        data.payload as TOutboxEventPayloadMap[typeof EVENT_TYPES.PRODUCT_REVIEW_DECIDED];
      const recipients = await resolveShopRecipients(
        manager,
        payload.shopId,
        SHOP_PERMISSIONS.PRODUCT_VIEW,
      );
      return recipients.map((recipientId) => ({
        recipientId,
        type: EVENT_TYPES.PRODUCT_REVIEW_DECIDED,
        title: 'Listing review result',
        body: 'Your shop listing has been reviewed. Open product management to view the result.',
        entityType: 'product',
        entityId: payload.productId,
        sendEmail: true,
      }));
    }

    case EVENT_TYPES.SHOP_INVITATION_CREATED: {
      const payload =
        data.payload as TOutboxEventPayloadMap[typeof EVENT_TYPES.SHOP_INVITATION_CREATED];
      return [
        {
          recipientId: payload.userId,
          type: EVENT_TYPES.SHOP_INVITATION_CREATED,
          title: 'Shop invitation',
          body: 'You have been invited to join a shop. Open Rewear to view your role and invitation expiry.',
          entityType: 'shop_invitation',
          entityId: payload.invitationId,
          sendEmail: true,
        },
      ];
    }

    case EVENT_TYPES.DISPUTE_UPDATED: {
      const payload =
        data.payload as TOutboxEventPayloadMap[typeof EVENT_TYPES.DISPUTE_UPDATED];
      const drafts: TNotificationDraft[] = [
        {
          recipientId: payload.buyerId,
          type: EVENT_TYPES.DISPUTE_UPDATED,
          title: 'Dispute update',
          body: 'Your dispute case has an update. Open the order to view details and response deadlines.',
          entityType: 'order',
          entityId: payload.orderId,
          sendEmail: payload.sendEmail,
        },
      ];
      const shopOwners = await resolveShopRecipients(
        manager,
        payload.shopId,
        SHOP_PERMISSIONS.SHOP_OWNER,
      );
      for (const ownerId of shopOwners) {
        drafts.push({
          recipientId: ownerId,
          type: EVENT_TYPES.DISPUTE_UPDATED,
          title: 'Dispute update',
          body: 'An order dispute has an update. Open the order to view and respond.',
          entityType: 'order',
          entityId: payload.orderId,
          sendEmail: payload.sendEmail,
        });
      }
      if (payload.includeAdmins) {
        const admins = await resolveAdminRecipients(manager);
        for (const adminId of admins) {
          drafts.push({
            recipientId: adminId,
            type: EVENT_TYPES.DISPUTE_UPDATED,
            title: 'Dispute needs adjudication',
            body: 'A dispute case has an update requiring admin review.',
            entityType: 'dispute_case',
            entityId: payload.disputeCaseId,
          });
        }
      }
      return drafts;
    }

    case EVENT_TYPES.CHAT_MESSAGE_CREATED: {
      const payload =
        data.payload as TOutboxEventPayloadMap[typeof EVENT_TYPES.CHAT_MESSAGE_CREATED];
      const rawRecipients =
        payload.senderId !== payload.buyerId
          ? [payload.buyerId]
          : await resolveShopRecipients(
              manager,
              payload.shopId,
              SHOP_PERMISSIONS.CHAT_MANAGE,
            );
      return rawRecipients
        .filter((id) => id !== payload.senderId)
        .map((recipientId) => ({
          recipientId,
          type: EVENT_TYPES.CHAT_MESSAGE_CREATED,
          title: 'New message',
          body: 'You have a new message in your Buyer–Shop conversation. Open the chat to read it.',
          entityType: 'chat_conversation',
          entityId: payload.conversationId,
        }));
    }

    case EVENT_TYPES.VIOLATION_REPORT_UPDATED: {
      const payload =
        data.payload as TOutboxEventPayloadMap[typeof EVENT_TYPES.VIOLATION_REPORT_UPDATED];
      const admins = await resolveAdminRecipients(manager);
      const recipients = Array.from(new Set([...admins, payload.reporterId]));
      return recipients.map((recipientId) => ({
        recipientId,
        type: EVENT_TYPES.VIOLATION_REPORT_UPDATED,
        title: 'Violation report update',
        body: 'A violation report has an update. Open the report to view its status and outcome.',
        entityType: 'violation_report',
        entityId: payload.reportId,
      }));
    }

    case EVENT_TYPES.SHOP_DEACTIVATED_FOR_REPORT: {
      const payload =
        data.payload as TOutboxEventPayloadMap[typeof EVENT_TYPES.SHOP_DEACTIVATED_FOR_REPORT];
      const owners = await resolveShopRecipients(
        manager,
        payload.shopId,
        SHOP_PERMISSIONS.SHOP_OWNER,
      );
      return owners.map((recipientId) => ({
        recipientId,
        type: EVENT_TYPES.SHOP_DEACTIVATED_FOR_REPORT,
        title: 'Shop moderation update',
        body: 'Your shop has been paused from new orders after a verified violation report. Contact support for details.',
        entityType: 'shop',
        entityId: payload.shopId,
      }));
    }

    default:
      return [];
  }
}
