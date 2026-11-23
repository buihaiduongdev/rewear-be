import { BadRequestException, ConflictException } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import { Product, ProductModeration } from '../entities';
import { ProductModerationStatus, ProductStatus } from '../enums';

/** Shared moderation boundary; never overwrite HELD/SOLD inventory ownership. */
export async function suspendProductForModeration(
  manager: EntityManager,
  id: string,
  reason: string,
  options: {
    expectedVersion?: number;
    expectedShopId?: string;
    allowAlreadySuspended?: boolean;
  } = {},
) {
  const product = await manager.findOneOrFail(Product, {
    where: { id },
    lock: { mode: 'pessimistic_write' },
  });
  const before = product.status;
  const alreadySuspended =
    options.allowAlreadySuspended && before === ProductStatus.SUSPENDED;
  const available = (
    [ProductStatus.ACTIVE, ProductStatus.HIDDEN] as ProductStatus[]
  ).includes(before);
  if (!available && !alreadySuspended)
    throw new ConflictException('Only an available listing can be suspended');
  if (!reason.trim())
    throw new BadRequestException('A suspension reason is required');
  const moderation = await manager.findOneByOrFail(ProductModeration, {
    productId: id,
  });
  const versionChanged =
    options.expectedVersion !== undefined &&
    moderation.version !== options.expectedVersion;
  const shopChanged =
    options.expectedShopId !== undefined &&
    product.shopId !== options.expectedShopId;
  if (versionChanged || shopChanged)
    throw new ConflictException('Product moderation snapshot changed');
  if (alreadySuspended) return { product, moderation, before, changed: false };
  moderation.status = ProductModerationStatus.SUSPENDED;
  moderation.reason = reason.trim();
  product.status = ProductStatus.SUSPENDED;
  await manager.save(ProductModeration, moderation);
  await manager.save(Product, product);
  return { product, moderation, before, changed: true };
}
