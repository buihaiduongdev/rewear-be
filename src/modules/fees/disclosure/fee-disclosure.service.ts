import { ForbiddenException, Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { Shop } from '@/modules/shop/entities';
import { ShopMember } from '@/modules/shop/entities/shop-member.entity';
import { ShopMemberRole, ShopStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { currentFeePolicy } from './fee-disclosure';
import { FeePolicy, FeePolicyShopAcceptance } from './fee-disclosure.entity';
import { feePolicyPublishSchema } from './fee-disclosure.schema';
import type { FeePolicyPublishInput } from './fee-disclosure.schema';

@Injectable()
export class FeeDisclosureService {
  constructor(private readonly db: DataSource) {}
  current() {
    return currentFeePolicy(this.db.manager);
  }
  publish(adminId: string, input: FeePolicyPublishInput) {
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const admin = await manager.findOneBy(User, {
        id: adminId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      });
      if (!admin) throw new ForbiddenException('Active Admin is required');
      const parsed = feePolicyPublishSchema.parse(input);
      const previous = await currentFeePolicy(manager);
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
      return manager.save(
        FeePolicy,
        manager.create(FeePolicy, {
          version: (previous?.version ?? 0) + 1,
          publishedBy: adminId,
          publishedAt: new Date(now),
          conditions: parsed.conditions,
        }),
      );
    });
  }
  accept(ownerId: string, shopId: string, policyId: string) {
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const user = await manager.findOneBy(User, {
        id: ownerId,
        status: UserStatus.ACTIVE,
      });
      const shop = await manager.findOneBy(Shop, {
        id: shopId,
        status: ShopStatus.ACTIVE,
      });
      if (!user || !shop)
        throw new ForbiddenException('Active Shop and Owner are required');
      const owner = await manager.findOneBy(ShopMember, {
        shopId,
        userId: ownerId,
        memberRole: ShopMemberRole.OWNER,
      });
      if (!owner)
        throw new ForbiddenException('Shop Owner acceptance is required');
      const policy = await currentFeePolicy(manager);
      if (!policy || policy.id !== policyId)
        throw new ForbiddenException('Accept the current published fee policy');
      const previous = await manager.findOneBy(FeePolicyShopAcceptance, {
        shopId,
        policyId,
      });
      if (previous) return previous;
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
      return manager.save(
        FeePolicyShopAcceptance,
        manager.create(FeePolicyShopAcceptance, {
          shopId,
          policyId,
          ownerId,
          acceptedAt: new Date(now),
        }),
      );
    });
  }
}
