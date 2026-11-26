import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';

import type { Job, Queue } from 'bullmq';
import { DataSource, type EntityManager } from 'typeorm';

import { QUEUE_NAMES } from '@/infrastructure/queue/queue.constants';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { ShopMemberRoleAssignment } from '@/modules/authorization/entities/shop-member-role-assignment.entity';
import { ShopRolePermission } from '@/modules/authorization/entities/shop-role-permission.entity';
import { ShopRole } from '@/modules/authorization/entities/shop-role.entity';
import {
  EVENT_TYPES,
  type TEventType,
} from '@/modules/event/constants/event-type.constant';
import { EventDelivery } from '@/modules/event/entities/event-delivery.entity';
import type { TOutboxEventPayloadMap } from '@/modules/event/types/outbox-event.type';
import { ORDER_EVENT_ACTION } from '@/modules/order/constants/order.constant';
import { ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { Notification } from './entities/notification.entity';
import type { TEmailNotificationJobData } from './notification-email.processor';
import { NotificationService } from './notification.service';

const NOTIFICATION_CONSUMER_NAME = 'notification';

export type TDomainEventJobData<K extends TEventType = TEventType> = {
  eventId: string;
  eventType: K;
  resourceId: string;
  payload: TOutboxEventPayloadMap[K];
};

type TNotificationDraft = {
  recipientId: string;
  type: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  sendEmail?: boolean;
};

@Injectable()
@Processor(QUEUE_NAMES.DOMAIN_EVENTS)
export class NotificationEventProcessor extends WorkerHost {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
    @InjectQueue(QUEUE_NAMES.EMAIL_NOTIFICATIONS)
    private readonly emailQueue: Queue<TEmailNotificationJobData>,
  ) {
    super();
  }

  async process(job: Job<TDomainEventJobData>): Promise<Notification[]> {
    return this.handleEvent(job.data);
  }

  async handleEvent(data: TDomainEventJobData): Promise<Notification[]> {
    const { created, emailIds } = await this.dataSource.transaction(
      async (manager) => {
        const deliveryInsert = await manager
          .createQueryBuilder()
          .insert()
          .into(EventDelivery)
          .values({
            eventId: data.eventId,
            consumerName: NOTIFICATION_CONSUMER_NAME,
          })
          .orIgnore()
          .returning('id')
          .execute();

        if (!(deliveryInsert.raw as { id: string }[]).length) {
          return { created: [] as Notification[], emailIds: new Set<string>() };
        }

        const drafts = await this.buildNotificationDrafts(manager, data);
        if (!drafts.length) {
          return { created: [] as Notification[], emailIds: new Set<string>() };
        }

        const repo = manager.getRepository(Notification);
        const saved = await repo.save(
          drafts.map((draft) =>
            repo.create({
              recipientId: draft.recipientId,
              type: draft.type,
              title: draft.title,
              body: draft.body,
              entityType: draft.entityType,
              entityId: draft.entityId,
              isRead: false,
            }),
          ),
        );

        const emailSet = new Set<string>();
        saved.forEach((notification, index) => {
          if (drafts[index]?.sendEmail) {
            emailSet.add(notification.id);
          }
        });

        return { created: saved, emailIds: emailSet };
      },
    );

    if (created.length > 0) {
      this.notificationService.emit(created);

      const emailJobs = created
        .filter((n) => emailIds.has(n.id))
        .map((n) => ({
          name: 'send-notification-email',
          data: {
            notificationId: n.id,
            recipientId: n.recipientId,
            title: n.title,
            body: n.body,
          },
          opts: {
            jobId: `notification-email-${n.id}`,
          },
        }));

      if (emailJobs.length > 0) {
        await this.emailQueue.addBulk(emailJobs);
      }
    }

    return created;
  }

  private async buildNotificationDrafts(
    manager: EntityManager,
    data: TDomainEventJobData,
  ): Promise<TNotificationDraft[]> {
    switch (data.eventType) {
      case EVENT_TYPES.ORDER_CREATED: {
        const payload =
          data.payload as TOutboxEventPayloadMap[typeof EVENT_TYPES.ORDER_CREATED];
        const shopUsers = (
          await this.resolveShopRecipients(
            manager,
            payload.shopId,
            SHOP_PERMISSIONS.ORDER_VIEW,
          )
        ).filter((id) => id !== payload.buyerId);
        const recipients = [payload.buyerId, ...shopUsers];
        return recipients.map((recipientId) => ({
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
          await this.resolveShopRecipients(
            manager,
            payload.shopId,
            SHOP_PERMISSIONS.ORDER_VIEW,
          )
        ).filter((id) => id !== payload.buyerId);
        const recipients = [payload.buyerId, ...shopUsers];
        return recipients.map((recipientId) => ({
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
        const admins = (await this.resolveAdminRecipients(manager)).filter(
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
        const recipients = await this.resolveShopRecipients(
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
        const shopOwners = await this.resolveShopRecipients(
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
          const admins = await this.resolveAdminRecipients(manager);
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
            : await this.resolveShopRecipients(
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
        const admins = await this.resolveAdminRecipients(manager);
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
        const owners = await this.resolveShopRecipients(
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

  private async resolveShopRecipients(
    manager: EntityManager,
    shopId: string,
    permission: string,
  ): Promise<string[]> {
    const owners = await manager
      .getRepository(ShopMember)
      .createQueryBuilder('member')
      .select('member.userId', 'userId')
      .where('member.shopId = :shopId', { shopId })
      .andWhere('member.memberRole = :ownerRole', {
        ownerRole: ShopMemberRole.OWNER,
      })
      .getRawMany<{ userId: string }>();

    const recipientSet = new Set(owners.map((row) => row.userId));
    if (permission === SHOP_PERMISSIONS.SHOP_OWNER) {
      return Array.from(recipientSet);
    }

    const staff = await manager
      .getRepository(ShopMember)
      .createQueryBuilder('member')
      .innerJoin(
        ShopMemberRoleAssignment,
        'assignment',
        'assignment.memberId = member.id',
      )
      .innerJoin(
        ShopRole,
        'role',
        'role.id = assignment.roleId AND role.shopId = :shopId',
        { shopId },
      )
      .innerJoin(
        ShopRolePermission,
        'rp',
        'rp.roleId = role.id AND rp.permissionKey = :permission',
        { permission },
      )
      .select('DISTINCT member.userId', 'userId')
      .where('member.shopId = :shopId', { shopId })
      .getRawMany<{ userId: string }>();

    for (const row of staff) {
      recipientSet.add(row.userId);
    }

    return Array.from(recipientSet);
  }

  private async resolveAdminRecipients(
    manager: EntityManager,
  ): Promise<string[]> {
    const admins = await manager.find(User, {
      where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      select: { id: true },
    });
    return admins.map((u) => u.id);
  }
}
