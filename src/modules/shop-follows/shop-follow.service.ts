import { Injectable, NotFoundException } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';

import { ShopFollow } from './entities/shop-follow.entity';
import { assertFollowUser } from './policies/shop-follow-access.policy';
import type { ShopFollowQuery } from './types/shop-follow.type';

@Injectable()
export class ShopFollowService {
  constructor(private readonly db: DataSource) {}
  follow(userId: string, shopId: string) {
    return this.db.transaction(async (manager) => {
      await assertFollowUser(manager, userId);
      await manager.query(
        'SELECT pg_advisory_xact_lock(782147, hashtext($1))',
        [userId + ':' + shopId],
      );
      const shop = await manager.findOne(Shop, {
        where: { id: shopId },
        lock: { mode: 'pessimistic_read' },
      });
      const existing = await manager.findOneBy(ShopFollow, { userId, shopId });
      if (!shop || (!existing && shop.status !== ShopStatus.ACTIVE))
        throw new NotFoundException('Active Shop not found');
      const row =
        existing ??
        (await manager.save(
          ShopFollow,
          manager.create(ShopFollow, { userId, shopId }),
        ));
      return { shopId, following: true, followedAt: row.createdAt };
    });
  }
  unfollow(userId: string, shopId: string) {
    return this.db.transaction(async (manager) => {
      await assertFollowUser(manager, userId);
      await manager.query(
        'SELECT pg_advisory_xact_lock(782147, hashtext($1))',
        [userId + ':' + shopId],
      );
      await manager.delete(ShopFollow, { userId, shopId });
      return { shopId, following: false, followedAt: null };
    });
  }
  state(userId: string, shopId: string) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      await assertFollowUser(manager, userId);
      const row = await manager.findOneBy(ShopFollow, { userId, shopId });
      if (
        !row &&
        !(await manager.existsBy(Shop, {
          id: shopId,
          status: ShopStatus.ACTIVE,
        }))
      )
        throw new NotFoundException('Active Shop not found');
      return { shopId, following: !!row, followedAt: row?.createdAt ?? null };
    });
  }
  list(userId: string, input: ShopFollowQuery) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      await assertFollowUser(manager, userId);
      const [rows, totalCount] = await manager.findAndCount(ShopFollow, {
        where: { userId },
        relations: { shop: true },
        order: { createdAt: 'DESC', id: 'DESC' },
        take: input.limit,
        skip: input.offset,
      });
      return {
        items: rows.map((row) => ({
          shopId: row.shopId,
          followedAt: row.createdAt,
          shop: {
            id: row.shop.id,
            name: row.shop.name,
            status: row.shop.status,
          },
        })),
        totalCount,
        ...input,
      };
    });
  }
}
