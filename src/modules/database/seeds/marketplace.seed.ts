import * as argon2 from 'argon2';
import type { DataSource, EntityManager, ObjectLiteral } from 'typeorm';

import { Category } from '@/modules/category/entities';
import { Media, MediaLink } from '@/modules/media/entities';
import { MediaOwnerType } from '@/modules/media/enums';
import { Product, ProductRevision } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';

import {
  DEFAULT_SEED_PASSWORD,
  SEED_ACCOUNTS,
  SEED_CATEGORIES,
  SEED_SHOPS,
} from './catalog';
import { MarketplaceFactory } from './factories/marketplace.factory';

export interface MarketplaceSeedOptions {
  namespace?: string;
  productCount?: number;
  password?: string;
  now?: Date;
}

export function validateSeedOptions(options: MarketplaceSeedOptions) {
  const namespace = options.namespace ?? 'demo';
  const productCount = options.productCount ?? 36;
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(namespace)) {
    throw new Error(
      'Seed namespace must be 1–32 lowercase letters, digits or hyphens',
    );
  }
  if (
    !Number.isInteger(productCount) ||
    productCount < 12 ||
    productCount > 200
  ) {
    throw new Error('Seed product count must be an integer between 12 and 200');
  }
  if (options.now && !Number.isFinite(options.now.getTime())) {
    throw new Error('Seed clock must be a valid date');
  }
  if (options.password !== undefined && options.password.length < 8) {
    throw new Error('Seed password must have at least 8 characters');
  }
  return { namespace, productCount };
}

async function insertMissing<T extends ObjectLiteral>(
  manager: EntityManager,
  target: new () => T,
  rows: T[],
) {
  if (rows.length === 0) return;
  // Deliberately preserve existing seed rows, including changes made by an E2E test.
  await manager
    .createQueryBuilder()
    .insert()
    .into(target)
    .values(rows)
    .orIgnore()
    .execute();
}

/** Add fixtures atomically, without truncating tables or overwriting existing data. */
export async function seedMarketplace(
  dataSource: DataSource,
  options: MarketplaceSeedOptions = {},
) {
  const { namespace, productCount } = validateSeedOptions(options);
  const factory = new MarketplaceFactory(namespace, options.now ?? new Date());
  const passwordHash = await argon2.hash(
    options.password ?? DEFAULT_SEED_PASSWORD,
  );
  const users = SEED_ACCOUNTS.map((_, index) =>
    factory.user(index, passwordHash),
  );
  const categories = SEED_CATEGORIES.map((_, index) => factory.category(index));
  const shops = SEED_SHOPS.map((_, index) => factory.shop(index));
  const members = shops.map((shop, index) =>
    factory.shopMember(index, shop.id, users[index + 2].id),
  );
  const products: Product[] = [];
  const media: Media[] = [];
  const links: MediaLink[] = [];
  const revisions: ProductRevision[] = [];
  const privateStatuses = [
    ProductStatus.DRAFT,
    ProductStatus.PENDING_REVIEW,
    ProductStatus.REJECTED,
    ProductStatus.HIDDEN,
    ProductStatus.HELD,
    ProductStatus.SOLD,
  ];

  for (let index = 0; index < productCount; index++) {
    const status =
      index < productCount - privateStatuses.length
        ? ProductStatus.ACTIVE
        : privateStatuses[index - productCount + privateStatuses.length];
    // Include both shop and individual inventory across several categories.
    const source =
      index % 4 === 3
        ? {
            shopId: null,
            sellerUserId: users[5 + (Math.floor(index / 4) % 2)].id,
          }
        : {
            shopId:
              shops[Math.floor(index / categories.length) % shops.length].id,
            sellerUserId: null,
          };
    const approved = [
      ProductStatus.ACTIVE,
      ProductStatus.HIDDEN,
      ProductStatus.HELD,
      ProductStatus.SOLD,
    ].includes(status);
    const product = factory.product(
      index,
      { ...source, categoryId: categories[index % categories.length].id },
      {
        status,
        approvedRevision: approved ? 1 : null,
        publishedAt: approved
          ? new Date(factory.now.getTime() - index * 60000)
          : null,
        heldUntil:
          status === ProductStatus.HELD
            ? new Date(factory.now.getTime() + 600000)
            : null,
        soldAt: status === ProductStatus.SOLD ? factory.now : null,
      },
    );
    if (status === ProductStatus.DRAFT) {
      // An intentionally incomplete draft exercises nullable fields in the new contract.
      Object.assign(product, {
        title: null,
        categoryId: null,
        description: null,
        price: null,
        condition: null,
      });
    }
    products.push(product);
    const uploaderId =
      source.sellerUserId ??
      members.find((member) => member.shopId === source.shopId)!.userId;
    const productMedia = Array.from({ length: 3 }, (_, slot) =>
      factory.media(index, slot, uploaderId),
    );
    const productLinks = productMedia.map((_, slot) =>
      factory.mediaLink(index, slot),
    );
    media.push(...productMedia);
    links.push(...productLinks);
    if (status !== ProductStatus.DRAFT) {
      const revision = Object.assign(new ProductRevision(), {
        id: factory.id(`revision:${index}:1`),
        productId: product.id,
        revision: 1,
        submittedById: uploaderId,
        decision: approved
          ? 'APPROVED'
          : status === ProductStatus.REJECTED
            ? 'REJECTED'
            : 'PENDING',
        reviewedById:
          status === ProductStatus.PENDING_REVIEW ? null : users[0].id,
        reviewedAt:
          status === ProductStatus.PENDING_REVIEW ? null : factory.now,
        reason:
          status === ProductStatus.REJECTED
            ? 'Demo rejection: add a clearer label photo.'
            : null,
        createdAt: factory.now,
        updatedAt: factory.now,
        snapshot: {
          categoryId: product.categoryId,
          title: product.title,
          description: product.description,
          condition: product.condition,
          size: product.size,
          color: product.color,
          brand: product.brand,
          price: product.price,
          measurements: product.measurements,
          repairs: product.repairs,
          defects: product.defects,
          media: productMedia.map((image, slot) => ({
            mediaId: image.id,
            url: image.url,
            storageKey: image.storageKey,
            mimeType: image.mimeType,
            sizeBytes: image.sizeBytes,
            eTag: image.eTag,
            role: productLinks[slot].role,
            sortOrder: slot,
            angle: productLinks[slot].angle,
          })),
        },
      });
      revisions.push(revision);
      links.push(
        ...productLinks.map((link, slot) =>
          Object.assign(new MediaLink(), link, {
            id: factory.id(`revision-link:${index}:${slot}`),
            ownerType: MediaOwnerType.PRODUCT_REVISION,
            ownerId: revision.id,
          }),
        ),
      );
    }
  }

  await dataSource.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `rewear-seed:${namespace}`,
    ]);
    await insertMissing(manager, User, users);
    await insertMissing(manager, Category, categories);
    await insertMissing(manager, Shop, shops);
    await insertMissing(manager, ShopMember, members);
    await insertMissing(manager, Product, products);
    await insertMissing(manager, Media, media);
    await insertMissing(manager, ProductRevision, revisions);
    await insertMissing(manager, MediaLink, links);
  });

  return {
    namespace,
    accounts: users.map(({ id, email, role }) => ({ id, email, role })),
    categoryIds: categories.map(({ id }) => id),
    shopIds: shops.map(({ id }) => id),
    productIds: products.map(({ id }) => id),
    counts: {
      users: users.length,
      categories: categories.length,
      shops: shops.length,
      members: members.length,
      products: products.length,
      activeProducts: products.filter(
        ({ status }) => status === ProductStatus.ACTIVE,
      ).length,
      media: media.length,
      revisions: revisions.length,
      mediaLinks: links.length,
    },
  };
}
