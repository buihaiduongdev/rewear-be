import { ForbiddenException, Injectable } from '@nestjs/common';

import { DataSource, type EntityManager } from 'typeorm';

import { ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';

import { SHOP_PERMISSION_KEYS, SHOP_PERMISSIONS } from './constants';
import { ShopMemberRoleAssignment } from './entities/shop-member-role-assignment.entity';
import { ShopRolePermission } from './entities/shop-role-permission.entity';
import { ShopRole } from './entities/shop-role.entity';

@Injectable()
export class AuthorizationService {
  constructor(private readonly dataSource: DataSource) {}

  async getMemberPermissions(userId: string, shopId: string) {
    const manager = this.dataSource.manager;
    const member = await manager.findOneBy(ShopMember, {
      userId,
      shopId,
    });
    if (!member) throw new ForbiddenException('Shop permission denied');
    if (member.memberRole === ShopMemberRole.OWNER)
      return {
        isOwner: true,
        roles: ['OWNER'],
        permissions: SHOP_PERMISSION_KEYS,
      };
    const rows = await manager
      .getRepository(ShopMemberRoleAssignment)
      .createQueryBuilder('assignment')
      .innerJoin(
        ShopRole,
        'role',
        'role.id = assignment.roleId AND role.shopId = :shopId',
        { shopId },
      )
      .leftJoin(
        ShopRolePermission,
        'permission',
        'permission.roleId = role.id AND permission.permissionKey != :ownerPermission',
        { ownerPermission: SHOP_PERMISSIONS.SHOP_OWNER },
      )
      .where('assignment.memberId = :memberId', { memberId: member.id })
      .select([
        'role.name AS "roleName"',
        'permission.permissionKey AS "permissionKey"',
      ])
      .getRawMany<{ roleName: string; permissionKey: string | null }>();

    return {
      isOwner: false,
      roles: [...new Set(rows.map((row) => row.roleName))],
      permissions: [
        ...new Set(
          rows
            .map((row) => row.permissionKey)
            .filter((p): p is string => Boolean(p)),
        ),
      ],
    };
  }

  async hasPermission(
    userId: string,
    shopId: string,
    permission: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<boolean> {
    const member = await manager
      .getRepository(ShopMember)
      .findOneBy({ userId, shopId });
    if (!member) return false;
    if (member.memberRole === ShopMemberRole.OWNER) return true;
    if (permission === SHOP_PERMISSIONS.SHOP_OWNER) return false;
    return manager
      .getRepository(ShopMemberRoleAssignment)
      .createQueryBuilder('assignment')
      .innerJoin(
        ShopRole,
        'role',
        'role.id = assignment.roleId AND role.shopId = :shopId',
        { shopId },
      )
      .innerJoin(
        ShopRolePermission,
        'permission',
        'permission.roleId = role.id AND permission.permissionKey = :permission',
        { permission },
      )
      .where('assignment.memberId = :memberId', { memberId: member.id })
      .getExists();
  }

  async authorize(
    userId: string,
    shopId: string,
    permission: string,
  ): Promise<void> {
    if (!(await this.hasPermission(userId, shopId, permission)))
      throw new ForbiddenException('Shop permission denied');
  }
}
