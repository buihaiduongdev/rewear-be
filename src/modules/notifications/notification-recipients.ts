import type { EntityManager } from 'typeorm';

import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { ShopMemberRoleAssignment } from '@/modules/authorization/entities/shop-member-role-assignment.entity';
import { ShopRolePermission } from '@/modules/authorization/entities/shop-role-permission.entity';
import { ShopRole } from '@/modules/authorization/entities/shop-role.entity';
import { ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

export async function resolveShopRecipients(
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

export async function resolveAdminRecipients(
  manager: EntityManager,
): Promise<string[]> {
  const admins = await manager.find(User, {
    where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  return admins.map((u) => u.id);
}
