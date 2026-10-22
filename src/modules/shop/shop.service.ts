import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, Repository } from 'typeorm';

import { User } from '@/modules/user/entities';

import { Shop, ShopMember } from './entities';
import { ShopMemberRole, ShopMemberStatus, ShopStatus } from './enums';
import type {
  AddShopStaffInput,
  CreateShopInput,
  UpdateShopInput,
  UpdateShopStaffInput,
} from './schemas/shop-input.schema';

@Injectable()
export class ShopService {
  constructor(
    @InjectRepository(Shop)
    private readonly shopRepository: Repository<Shop>,
    @InjectRepository(ShopMember)
    private readonly shopMemberRepository: Repository<ShopMember>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(): Promise<Shop[]> {
    return this.shopRepository.find({
      where: { status: ShopStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Shop> {
    const shop = await this.shopRepository.findOneBy({
      id,
      status: ShopStatus.ACTIVE,
    });
    if (!shop) throw new NotFoundException('Shop not found');
    return shop;
  }

  findMyMemberships(userId: string): Promise<ShopMember[]> {
    return this.shopMemberRepository.find({
      where: { userId, status: ShopMemberStatus.ACTIVE },
      relations: { shop: true },
      order: { joinedAt: 'DESC' },
    });
  }

  create(userId: string, input: CreateShopInput): Promise<Shop> {
    return this.dataSource.transaction(async (manager) => {
      const shop = await manager.save(
        Shop,
        manager.create(Shop, {
          name: input.name.trim(),
          description: input.description?.trim() || null,
          status: ShopStatus.ACTIVE,
        }),
      );
      await manager.save(
        ShopMember,
        manager.create(ShopMember, {
          shopId: shop.id,
          userId,
          memberRole: ShopMemberRole.OWNER,
          status: ShopMemberStatus.ACTIVE,
        }),
      );
      return shop;
    });
  }

  async update(
    shopId: string,
    currentUserId: string,
    input: UpdateShopInput,
  ): Promise<Shop> {
    await this.assertOwner(shopId, currentUserId);
    const shop = await this.findById(shopId);

    if (input.name !== undefined) shop.name = input.name.trim();
    if (input.description !== undefined) {
      shop.description = input.description.trim() || null;
    }
    if (input.status !== undefined) shop.status = input.status;

    return this.shopRepository.save(shop);
  }

  async findMembers(
    shopId: string,
    currentUserId: string,
  ): Promise<ShopMember[]> {
    await this.assertOwner(shopId, currentUserId);
    return this.shopMemberRepository.find({
      where: { shopId },
      relations: { user: true },
      order: { memberRole: 'ASC', joinedAt: 'ASC' },
    });
  }

  async addStaff(
    shopId: string,
    currentUserId: string,
    input: AddShopStaffInput,
  ): Promise<ShopMember> {
    await this.assertOwner(shopId, currentUserId);
    if (!(await this.userRepository.findOneBy({ id: input.userId }))) {
      throw new NotFoundException('User not found');
    }
    if (
      await this.shopMemberRepository.findOneBy({
        shopId,
        userId: input.userId,
      })
    ) {
      throw new ConflictException('User is already a shop member');
    }

    const member = await this.shopMemberRepository.save(
      this.shopMemberRepository.create({
        shopId,
        userId: input.userId,
        memberRole: ShopMemberRole.STAFF,
        status: ShopMemberStatus.ACTIVE,
      }),
    );
    return this.findMemberWithUser(shopId, member.id);
  }

  async updateStaff(
    shopId: string,
    memberId: string,
    currentUserId: string,
    input: UpdateShopStaffInput,
  ): Promise<ShopMember> {
    await this.assertOwner(shopId, currentUserId);
    const member = await this.shopMemberRepository.findOneBy({
      id: memberId,
      shopId,
    });
    if (!member) throw new NotFoundException('Shop member not found');
    if (member.memberRole !== ShopMemberRole.STAFF) {
      throw new ForbiddenException('Shop owner membership cannot be changed');
    }

    member.status = input.status;
    await this.shopMemberRepository.save(member);
    return this.findMemberWithUser(shopId, member.id);
  }

  private async assertOwner(shopId: string, userId: string): Promise<void> {
    if (!(await this.shopRepository.findOneBy({ id: shopId }))) {
      throw new NotFoundException('Shop not found');
    }
    const owner = await this.shopMemberRepository.findOneBy({
      shopId,
      userId,
      memberRole: ShopMemberRole.OWNER,
      status: ShopMemberStatus.ACTIVE,
    });
    if (!owner) throw new ForbiddenException('Shop owner access required');
  }

  private async findById(id: string): Promise<Shop> {
    const shop = await this.shopRepository.findOneBy({ id });
    if (!shop) throw new NotFoundException('Shop not found');
    return shop;
  }

  private async findMemberWithUser(
    shopId: string,
    memberId: string,
  ): Promise<ShopMember> {
    const member = await this.shopMemberRepository.findOne({
      where: { id: memberId, shopId },
      relations: { user: true },
    });
    if (!member) throw new NotFoundException('Shop member not found');
    return member;
  }
}
