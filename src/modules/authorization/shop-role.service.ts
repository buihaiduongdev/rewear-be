import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

import { DataSource, type EntityManager, In } from 'typeorm';

import { ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';

import { DEFAULT_SHOP_ROLES } from './constants';
import { ShopMemberRoleAssignment } from './entities/shop-member-role-assignment.entity';
import { ShopRolePermission } from './entities/shop-role-permission.entity';
import { ShopRole } from './entities/shop-role.entity';
import type {
  AssignRolesInput,
  CreateRoleInput,
  UpdateRoleInput,
} from './schemas/shop-role-input.schema';

@Injectable()
export class ShopRoleService {
  constructor(private readonly db: DataSource) {}

  async initializeDefaultRoles(
    shopId: string,
    manager: EntityManager = this.db.manager,
  ): Promise<void> {
    const roles = await manager.save(
      ShopRole,
      DEFAULT_SHOP_ROLES.map((item) =>
        manager.create(ShopRole, { shopId, name: item.name, isDefault: true }),
      ),
    );

    const permissions = roles.flatMap((role, index) =>
      DEFAULT_SHOP_ROLES[index].permissions.map((permissionKey) =>
        manager.create(ShopRolePermission, {
          roleId: role.id,
          permissionKey,
        }),
      ),
    );

    await manager.save(ShopRolePermission, permissions);
  }

  async list(shopId: string) {
    const roles = await this.db.getRepository(ShopRole).find({
      where: { shopId },
      relations: { permissions: true },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
    return roles.map((role) => ({
      ...role,
      permissions: (role.permissions ?? []).map(
        ({ permissionKey }) => permissionKey,
      ),
    }));
  }

  create(shopId: string, { name, permissions }: CreateRoleInput) {
    if (name.toUpperCase() === 'OWNER')
      throw new BadRequestException('Owner is a reserved role');

    return this.db.transaction(async (manager) => {
      if (await manager.exists(ShopRole, { where: { shopId, name } }))
        throw new ConflictException('Shop role name already exists');

      const uniquePermissions = [...new Set(permissions)];
      const role = await manager.save(
        ShopRole,
        manager.create(ShopRole, {
          shopId,
          name,
          isDefault: false,
          permissions: uniquePermissions.map((permissionKey) =>
            manager.create(ShopRolePermission, { permissionKey }),
          ),
        }),
      );

      return { ...role, permissions: uniquePermissions };
    });
  }

  update(
    shopId: string,
    roleId: string,
    { permissions, name }: UpdateRoleInput,
  ) {
    if (name !== undefined && name.toUpperCase() === 'OWNER')
      throw new BadRequestException('Owner is a reserved role');

    return this.db.transaction(async (manager) => {
      const role = await manager.findOneByOrFail(ShopRole, {
        id: roleId,
        shopId,
      });

      if (name !== undefined && name !== role.name) {
        if (role.isDefault)
          throw new BadRequestException('Default role names cannot be changed');
        if (await manager.exists(ShopRole, { where: { shopId, name } }))
          throw new ConflictException('Shop role name already exists');
        role.name = name;
        await manager.save(ShopRole, role);
      }

      if (permissions !== undefined) {
        await manager.delete(ShopRolePermission, { roleId });
        const uniquePermissions = [...new Set(permissions)];
        if (uniquePermissions.length) {
          await manager.save(
            ShopRolePermission,
            uniquePermissions.map((permissionKey) =>
              manager.create(ShopRolePermission, { roleId, permissionKey }),
            ),
          );
        }
        return { ...role, permissions: uniquePermissions };
      }

      const assigned = await manager.findBy(ShopRolePermission, { roleId });
      return {
        ...role,
        permissions: assigned.map(({ permissionKey }) => permissionKey),
      };
    });
  }

  assign(shopId: string, memberId: string, { roleIds }: AssignRolesInput) {
    return this.db.transaction(async (manager) => {
      const member = await manager.findOneByOrFail(ShopMember, {
        id: memberId,
        shopId,
      });
      if (member.memberRole === ShopMemberRole.OWNER)
        throw new BadRequestException('Owner roles cannot be changed');
      const uniqueIds = [...new Set(roleIds)];
      const roles = uniqueIds.length
        ? await manager.findBy(ShopRole, { id: In(uniqueIds), shopId })
        : [];
      if (roles.length !== uniqueIds.length)
        throw new BadRequestException('Invalid shop roles');
      await manager.delete(ShopMemberRoleAssignment, { memberId });
      await manager.save(
        ShopMemberRoleAssignment,
        uniqueIds.map((roleId) => ({ memberId, roleId })),
      );
      return {
        memberId,
        roles: roles.map((role) => ({ id: role.id, name: role.name })),
      };
    });
  }
}
