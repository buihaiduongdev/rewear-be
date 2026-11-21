import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Brackets, DataSource, EntityManager } from 'typeorm';

import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { ShopMember } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { NOTIFICATION_SCOPE } from './constants/notification.constant';
import { Notification } from './entities/notification.entity';
import type { NotificationQuery } from './schemas/notification.schema';

@Injectable()
export class NotificationService {
  constructor(
    private readonly db: DataSource,
    private readonly authorization: AuthorizationService,
  ) {}
  async canRead(
    manager: EntityManager,
    user: User,
    notification: Notification,
  ) {
    if (
      user.status !== UserStatus.ACTIVE ||
      notification.recipientId !== user.id
    )
      return false;
    if (notification.scope === NOTIFICATION_SCOPE.USER) return true;
    if (notification.scope === NOTIFICATION_SCOPE.ADMIN)
      return user.role === UserRole.ADMIN;
    return (
      !!notification.shopId &&
      !!notification.permission &&
      (await this.authorization.hasPermission(
        user.id,
        notification.shopId,
        notification.permission,
        manager,
      ))
    );
  }
  private async visible(manager: EntityManager, userId: string) {
    const user = await manager.findOneBy(User, {
      id: userId,
      status: UserStatus.ACTIVE,
    });
    if (!user) throw new ForbiddenException('Active user required');
    const membership = await manager.findOneBy(ShopMember, { userId });
    const permissions = membership
      ? await manager
          .createQueryBuilder(Notification, 'notice')
          .select('DISTINCT notice.permission', 'permission')
          .where('notice.recipientId = :userId AND notice.shopId = :shopId', {
            userId,
            shopId: membership.shopId,
          })
          .getRawMany<{ permission: string }>()
      : [];
    const allowed: string[] = [];
    for (const { permission } of permissions)
      if (
        permission &&
        (await this.authorization.hasPermission(
          userId,
          membership!.shopId,
          permission,
          manager,
        ))
      )
        allowed.push(permission);
    return manager
      .createQueryBuilder(Notification, 'notice')
      .where('notice.recipientId = :userId', { userId })
      .andWhere(
        new Brackets((q) => {
          q.where('notice.scope = :personal', {
            personal: NOTIFICATION_SCOPE.USER,
          });
          if (user.role === UserRole.ADMIN)
            q.orWhere('notice.scope = :admin', {
              admin: NOTIFICATION_SCOPE.ADMIN,
            });
          if (membership && allowed.length)
            q.orWhere(
              '(notice.scope = :shop AND notice.shopId = :shopId AND notice.permission IN (:...permissions))',
              {
                shop: NOTIFICATION_SCOPE.SHOP,
                shopId: membership.shopId,
                permissions: allowed,
              },
            );
        }),
      );
  }
  list(userId: string, input: NotificationQuery) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const query = await this.visible(manager, userId);
      if (input.unreadOnly) query.andWhere('notice.readAt IS NULL');
      const [items, total] = await query
        .orderBy('notice.createdAt', 'DESC')
        .addOrderBy('notice.id', 'DESC')
        .take(input.limit)
        .skip(input.offset)
        .getManyAndCount();
      return { items, total, offset: input.offset, limit: input.limit };
    });
  }
  unread(userId: string) {
    return this.db.transaction('REPEATABLE READ', async (manager) => ({
      count: await (
        await this.visible(manager, userId)
      )
        .andWhere('notice.readAt IS NULL')
        .getCount(),
    }));
  }
  read(userId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const row = await (
        await this.visible(manager, userId)
      )
        .andWhere('notice.id = :id', { id })
        .setLock('pessimistic_write')
        .getOne();
      if (!row) throw new NotFoundException('Notification not found');
      if (!row.readAt) {
        const [{ now }] = await manager.query(
          'SELECT clock_timestamp() AS now',
        );
        row.readAt = new Date(now);
        await manager.save(row);
      }
      return row;
    });
  }
  readAll(userId: string) {
    return this.db.transaction(async (manager) => {
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
      const visible = await this.visible(manager, userId);
      const ids = await visible
        .select('notice.id', 'id')
        .andWhere('notice.readAt IS NULL')
        .andWhere('notice.createdAt <= :now', { now })
        .getRawMany<{ id: string }>();
      if (ids.length)
        await manager
          .createQueryBuilder()
          .update(Notification)
          .set({ readAt: new Date(now) })
          .whereInIds(ids.map((row) => row.id))
          .andWhere('"readAt" IS NULL')
          .execute();
      return { count: ids.length };
    });
  }
}
