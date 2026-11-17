import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, In, MoreThan, Repository } from 'typeorm';

import { handleDatabaseConstraint } from '@/common/utils/database-constraint.util';
import { ShopMemberRoleAssignment } from '@/modules/authorization/entities/shop-member-role-assignment.entity';
import { ShopRole } from '@/modules/authorization/entities/shop-role.entity';
import { ShopRoleService } from '@/modules/authorization/shop-role.service';
import { User } from '@/modules/user/entities';

import { Shop, ShopMember } from './entities';
import { ShopInvitation } from './entities/shop-invitation.entity';
import { ShopMemberRole, ShopStatus } from './enums';
import { ShopInvitationStatus } from './enums/shop-invitation-status.enum';
import type {
  CreateShopInput,
  InviteShopMemberInput,
  UpdateShopInput,
} from './schemas/shop-input.schema';

@Injectable()
export class ShopService {
  constructor(
    @InjectRepository(Shop)
    private readonly shopRepository: Repository<Shop>,
    @InjectRepository(ShopMember)
    private readonly shopMemberRepository: Repository<ShopMember>,
    private readonly dataSource: DataSource,
    private readonly shopRoleService: ShopRoleService,
  ) {}

  findAll(): Promise<Shop[]> {
    return this.shopRepository.find({
      where: { status: ShopStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  }

  findOne(id: string): Promise<Shop> {
    return this.shopRepository.findOneByOrFail({
      id,
      status: ShopStatus.ACTIVE,
    });
  }

  create(userId: string, input: CreateShopInput): Promise<Shop> {
    return this.dataSource.transaction(async (manager) => {
      const shop = await manager.save(
        Shop,
        manager.create(Shop, {
          name: input.name,
          description: input.description || null,
          status: ShopStatus.ACTIVE,
        }),
      );
      try {
        await manager.save(
          ShopMember,
          manager.create(ShopMember, {
            shopId: shop.id,
            userId,
            memberRole: ShopMemberRole.OWNER,
          }),
        );
      } catch (error) {
        handleDatabaseConstraint(error, {
          UQ_shop_members_user: 'User already belongs to a shop',
        });
      }
      await this.shopRoleService.initializeDefaultRoles(shop.id, manager);
      return shop;
    });
  }

  async update(
    shopId: string,
    currentUserId: string,
    input: UpdateShopInput,
  ): Promise<Shop> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Shop);
      const shop = await repository.findOneByOrFail({ id: shopId });
      repository.merge(shop, {
        ...input,
        description:
          input.description !== undefined
            ? input.description || null
            : undefined,
      });
      return repository.save(shop);
    });
  }

  async findMembers(
    shopId: string,
  ): Promise<(ShopMember & { roles: { id: string; name: string }[] })[]> {
    const members = await this.shopMemberRepository.find({
      where: { shopId },
      relations: { user: true },
      order: { memberRole: 'ASC', joinedAt: 'ASC' },
    });
    if (!members.length) return [];

    const assignments = await this.dataSource
      .getRepository(ShopMemberRoleAssignment)
      .createQueryBuilder('assignment')
      .innerJoin(
        ShopRole,
        'role',
        'role.id = assignment.roleId AND role.shopId = :shopId',
        { shopId },
      )
      .where('assignment.memberId IN (:...memberIds)', {
        memberIds: members.map((m) => m.id),
      })
      .select([
        'assignment.memberId AS "memberId"',
        'role.id AS "roleId"',
        'role.name AS "roleName"',
      ])
      .getRawMany<{ memberId: string; roleId: string; roleName: string }>();

    const rolesByMemberId = new Map<string, { id: string; name: string }[]>();
    for (const row of assignments) {
      const list = rolesByMemberId.get(row.memberId) ?? [];
      list.push({ id: row.roleId, name: row.roleName });
      rolesByMemberId.set(row.memberId, list);
    }

    return members.map((member) => ({
      ...member,
      roles: rolesByMemberId.get(member.id) ?? [],
    }));
  }

  async removeMember(shopId: string, memberId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const member = await manager.findOneByOrFail(ShopMember, {
        id: memberId,
        shopId,
      });
      if (member.memberRole === ShopMemberRole.OWNER)
        throw new ForbiddenException('Shop owner membership cannot be removed');
      await manager.remove(member);
    });
  }

  invite(shopId: string, { email, roleIds }: InviteShopMemberInput) {
    return this.dataSource.transaction(async (manager) => {
      const { id: userId } = await manager.findOneByOrFail(User, {
        email: email.trim().toLowerCase(),
      });
      if (
        await manager.findOneBy(ShopMember, {
          userId,
        })
      )
        throw new ConflictException('User already belongs to a shop');
      const ids = [...new Set(roleIds)];
      const roles = ids.length
        ? await manager.findBy(ShopRole, { id: In(ids), shopId })
        : [];
      if (roles.length !== ids.length)
        throw new BadRequestException('Invalid shop roles');
      const existing = await manager.findOneBy(ShopInvitation, {
        shopId,
        userId,
        status: ShopInvitationStatus.PENDING,
      });
      if (existing && existing.expiresAt > new Date())
        throw new ConflictException('An invitation is already pending');
      if (existing)
        await manager.update(
          ShopInvitation,
          { id: existing.id },
          { status: ShopInvitationStatus.REVOKED },
        );
      const invitation = await manager.save(
        ShopInvitation,
        manager.create(ShopInvitation, {
          shopId,
          userId,
          roleIds: ids,
          status: ShopInvitationStatus.PENDING,
          expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        }),
      );
      return invitation;
    });
  }

  async findMyInvitations(userId: string) {
    const invitations = await this.dataSource
      .getRepository(ShopInvitation)
      .find({
        where: {
          userId,
          status: ShopInvitationStatus.PENDING,
          expiresAt: MoreThan(new Date()),
        },
        relations: { shop: true },
        order: { createdAt: 'DESC' },
      });
    return invitations;
  }

  async list(shopId: string) {
    return this.dataSource.getRepository(ShopInvitation).find({
      where: {
        shopId,
        status: ShopInvitationStatus.PENDING,
        expiresAt: MoreThan(new Date()),
      },
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
  }

  revoke(shopId: string, invitationId: string) {
    return this.dataSource.transaction(async (manager) => {
      const invitation = await manager.findOneOrFail(ShopInvitation, {
        where: {
          id: invitationId,
          shopId,
          status: ShopInvitationStatus.PENDING,
        },
      });
      invitation.status = ShopInvitationStatus.REVOKED;
      return manager.save(invitation);
    });
  }

  leave(shopId: string, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const member = await manager.findOneByOrFail(ShopMember, {
        shopId,
        userId,
      });
      if (member.memberRole === ShopMemberRole.OWNER)
        throw new ForbiddenException(
          'Owner must transfer ownership before leaving',
        );
      await manager.remove(member);
    });
  }

  accept(userId: string, invitationId: string) {
    return this.dataSource.transaction(async (manager) => {
      const invitation = await manager.findOneOrFail(ShopInvitation, {
        where: { id: invitationId, userId },
      });
      if (
        invitation.status !== ShopInvitationStatus.PENDING ||
        invitation.expiresAt <= new Date()
      )
        throw new BadRequestException('Invitation is no longer valid');
      const validRoles = invitation.roleIds.length
        ? await manager.findBy(ShopRole, {
            id: In(invitation.roleIds),
            shopId: invitation.shopId,
          })
        : [];
      if (validRoles.length !== invitation.roleIds.length)
        throw new BadRequestException(
          'Invitation roles are no longer available',
        );
      let member: ShopMember;
      try {
        member = await manager.save(
          ShopMember,
          manager.create(ShopMember, {
            shopId: invitation.shopId,
            userId,
            memberRole: ShopMemberRole.STAFF,
          }),
        );
      } catch (error) {
        handleDatabaseConstraint(error, {
          UQ_shop_members_user: 'User already belongs to a shop',
        });
      }
      await manager.save(
        ShopMemberRoleAssignment,
        invitation.roleIds.map((roleId) => ({ memberId: member.id, roleId })),
      );
      invitation.status = ShopInvitationStatus.ACCEPTED;
      await manager.save(invitation);
      return member;
    });
  }
}
