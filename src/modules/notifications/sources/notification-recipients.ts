import type { EntityManager } from 'typeorm';

import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { ShopMember } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { NOTIFICATION_SCOPE } from '../constants/notification.constant';
import type { NotificationRecipient } from '../schemas/notification.schema';

export async function shopRecipients(
  manager: EntityManager,
  shopId: string,
  permission: string,
) {
  const authorization = new AuthorizationService(manager.connection);
  const members = await manager.findBy(ShopMember, { shopId });
  const result: NotificationRecipient[] = [];
  for (const member of members)
    if (
      await authorization.hasPermission(
        member.userId,
        shopId,
        permission,
        manager,
      )
    )
      result.push({
        userId: member.userId,
        scope: NOTIFICATION_SCOPE.SHOP,
        shopId,
        permission,
      });
  return result;
}
export async function adminRecipients(
  manager: EntityManager,
): Promise<NotificationRecipient[]> {
  const users = await manager.findBy(User, {
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  });
  return users.map((user) => ({
    userId: user.id,
    scope: NOTIFICATION_SCOPE.ADMIN,
  }));
}
export function personalRecipient(userId: string): NotificationRecipient {
  return { userId, scope: NOTIFICATION_SCOPE.USER };
}
