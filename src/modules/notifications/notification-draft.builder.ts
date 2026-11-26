import { match } from 'ts-pattern';
import type { EntityManager } from 'typeorm';

import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { ShopMemberRoleAssignment } from '@/modules/authorization/entities/shop-member-role-assignment.entity';
import { ShopRolePermission } from '@/modules/authorization/entities/shop-role-permission.entity';
import { ShopRole } from '@/modules/authorization/entities/shop-role.entity';
import {
  EVENT_TYPES,
  type TEventType,
} from '@/modules/event/constants/event-type.constant';
import type { TOutboxEventPayloadMap } from '@/modules/event/types/outbox-event.type';
import { ORDER_EVENT_ACTION } from '@/modules/order/constants/order.constant';
import { ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { NOTIFICATION_MESSAGES } from './constants/notification-messages.constant';

export type TDomainEventJobData<K extends TEventType = TEventType> = {
  [E in K]: {
    eventId: string;
    eventType: E;
    resourceId: string;
    payload: TOutboxEventPayloadMap[E];
  };
}[K];

export type TNotificationDraft = {
  recipientId: string;
  type: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  sendEmail?: boolean;
};

async function resolveShopRecipients(
  manager: EntityManager,
  shopId: string,
  permission: string,
): Promise<string[]> {
  const qb = manager
    .getRepository(ShopMember)
    .createQueryBuilder('member')
    .select('DISTINCT member.userId', 'userId')
    .where('member.shopId = :shopId', { shopId });

  if (permission === SHOP_PERMISSIONS.SHOP_OWNER) {
    qb.andWhere('member.memberRole = :ownerRole', {
      ownerRole: ShopMemberRole.OWNER,
    });
  } else {
    qb.leftJoin(
      ShopMemberRoleAssignment,
      'assignment',
      'assignment.memberId = member.id',
    )
      .leftJoin(
        ShopRole,
        'role',
        'role.id = assignment.roleId AND role.shopId = :shopId',
        { shopId },
      )
      .leftJoin(
        ShopRolePermission,
        'rp',
        'rp.roleId = role.id AND rp.permissionKey = :permission',
        { permission },
      )
      .andWhere(
        '(member.memberRole = :ownerRole OR rp.permissionKey IS NOT NULL)',
        { ownerRole: ShopMemberRole.OWNER },
      );
  }

  const rows = await qb.getRawMany<{ userId: string }>();
  return rows.map((row) => row.userId);
}

async function resolveAdminRecipients(
  manager: EntityManager,
): Promise<string[]> {
  const admins = await manager.find(User, {
    where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  return admins.map((u) => u.id);
}

export async function buildNotificationDrafts(
  manager: EntityManager,
  data: TDomainEventJobData,
): Promise<TNotificationDraft[]> {
  return match(data)
    .returnType<Promise<TNotificationDraft[]> | TNotificationDraft[]>()
    .with({ eventType: EVENT_TYPES.ORDER_CREATED }, async ({ payload }) => {
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
        ...NOTIFICATION_MESSAGES[EVENT_TYPES.ORDER_CREATED],
        entityType: 'order',
        entityId: payload.orderId,
        sendEmail: true,
      }));
    })
    .with({ eventType: EVENT_TYPES.ORDER_UPDATED }, async ({ payload }) => {
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
        ...NOTIFICATION_MESSAGES[EVENT_TYPES.ORDER_UPDATED],
        entityType: 'order',
        entityId: payload.orderId,
      }));
    })
    .with(
      { eventType: EVENT_TYPES.SHOP_APPLICATION_DECIDED },
      async ({ payload }) => {
        const msg = NOTIFICATION_MESSAGES[EVENT_TYPES.SHOP_APPLICATION_DECIDED];
        const drafts: TNotificationDraft[] = [
          {
            recipientId: payload.applicantId,
            type: EVENT_TYPES.SHOP_APPLICATION_DECIDED,
            ...msg.applicant,
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
            ...msg.admin,
            entityType: 'shop_application',
            entityId: payload.applicationId,
          });
        }
        return drafts;
      },
    )
    .with({ eventType: EVENT_TYPES.SHOP_IDENTITY_RENEWAL }, ({ payload }) => [
      {
        recipientId: payload.applicantId,
        type: EVENT_TYPES.SHOP_IDENTITY_RENEWAL,
        ...NOTIFICATION_MESSAGES[EVENT_TYPES.SHOP_IDENTITY_RENEWAL](
          payload.stage,
        ),
        entityType: 'shop_application',
        entityId: payload.applicationId,
        sendEmail: true,
      },
    ])
    .with(
      { eventType: EVENT_TYPES.PRODUCT_REVIEW_DECIDED },
      async ({ payload }) => {
        const recipients = await resolveShopRecipients(
          manager,
          payload.shopId,
          SHOP_PERMISSIONS.PRODUCT_VIEW,
        );
        return recipients.map((recipientId) => ({
          recipientId,
          type: EVENT_TYPES.PRODUCT_REVIEW_DECIDED,
          ...NOTIFICATION_MESSAGES[EVENT_TYPES.PRODUCT_REVIEW_DECIDED],
          entityType: 'product',
          entityId: payload.productId,
          sendEmail: true,
        }));
      },
    )
    .with({ eventType: EVENT_TYPES.SHOP_INVITATION_CREATED }, ({ payload }) => [
      {
        recipientId: payload.userId,
        type: EVENT_TYPES.SHOP_INVITATION_CREATED,
        ...NOTIFICATION_MESSAGES[EVENT_TYPES.SHOP_INVITATION_CREATED],
        entityType: 'shop_invitation',
        entityId: payload.invitationId,
        sendEmail: true,
      },
    ])
    .with({ eventType: EVENT_TYPES.DISPUTE_UPDATED }, async ({ payload }) => {
      const msg = NOTIFICATION_MESSAGES[EVENT_TYPES.DISPUTE_UPDATED];
      const drafts: TNotificationDraft[] = [
        {
          recipientId: payload.buyerId,
          type: EVENT_TYPES.DISPUTE_UPDATED,
          ...msg.buyer,
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
          ...msg.seller,
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
            ...msg.admin,
            entityType: 'dispute_case',
            entityId: payload.disputeCaseId,
          });
        }
      }
      return drafts;
    })
    .with(
      { eventType: EVENT_TYPES.CHAT_MESSAGE_CREATED },
      async ({ payload }) => {
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
            ...NOTIFICATION_MESSAGES[EVENT_TYPES.CHAT_MESSAGE_CREATED],
            entityType: 'chat_conversation',
            entityId: payload.conversationId,
          }));
      },
    )
    .with(
      { eventType: EVENT_TYPES.VIOLATION_REPORT_UPDATED },
      async ({ payload }) => {
        const admins = await resolveAdminRecipients(manager);
        const recipients = Array.from(new Set([...admins, payload.reporterId]));
        return recipients.map((recipientId) => ({
          recipientId,
          type: EVENT_TYPES.VIOLATION_REPORT_UPDATED,
          ...NOTIFICATION_MESSAGES[EVENT_TYPES.VIOLATION_REPORT_UPDATED],
          entityType: 'violation_report',
          entityId: payload.reportId,
        }));
      },
    )
    .with(
      { eventType: EVENT_TYPES.SHOP_DEACTIVATED_FOR_REPORT },
      async ({ payload }) => {
        const owners = await resolveShopRecipients(
          manager,
          payload.shopId,
          SHOP_PERMISSIONS.SHOP_OWNER,
        );
        return owners.map((recipientId) => ({
          recipientId,
          type: EVENT_TYPES.SHOP_DEACTIVATED_FOR_REPORT,
          ...NOTIFICATION_MESSAGES[EVENT_TYPES.SHOP_DEACTIVATED_FOR_REPORT],
          entityType: 'shop',
          entityId: payload.shopId,
        }));
      },
    )
    .exhaustive();
}
