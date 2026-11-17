import type { EntityManager } from 'typeorm';

import { CategoryFactory } from '@/database/factories/category.factory';
import { MediaLinkFactory } from '@/database/factories/media-link.factory';
import { MediaFactory } from '@/database/factories/media.factory';
import { ProductModerationFactory } from '@/database/factories/product-moderation.factory';
import { ProductFactory } from '@/database/factories/product.factory';
import { ShopMemberFactory } from '@/database/factories/shop-member.factory';
import { ShopFactory } from '@/database/factories/shop.factory';
import { UserFactory } from '@/database/factories/user.factory';
import { ShopRoleService } from '@/modules/authorization/shop-role.service';
import { Category } from '@/modules/category/entities';
import { Media, MediaLink } from '@/modules/media/entities';
import { MediaRole } from '@/modules/media/enums';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductCondition,
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import {
  DEFAULT_SEED_PASSWORD,
  SEED_ACCOUNTS,
  SEED_CATEGORIES,
  SEED_SHOPS,
} from './catalog';

export async function runInitialDataSeed(manager: EntityManager) {
  const userFactory = new UserFactory(manager.getRepository(User));
  const categoryFactory = new CategoryFactory(manager.getRepository(Category));
  const shopFactory = new ShopFactory(manager.getRepository(Shop));
  const memberFactory = new ShopMemberFactory(
    manager.getRepository(ShopMember),
  );
  const productFactory = new ProductFactory(manager.getRepository(Product));
  const moderationFactory = new ProductModerationFactory(
    manager.getRepository(ProductModeration),
  );
  const mediaFactory = new MediaFactory(manager.getRepository(Media));
  const linkFactory = new MediaLinkFactory(manager.getRepository(MediaLink));

  const users: User[] = [];
  for (const [index, account] of SEED_ACCOUNTS.entries()) {
    users.push(
      await userFactory.create(
        {
          fullName: account.fullName,
          email: `${account.key}.demo@seed.rewear.test`,
          role: index === 0 ? UserRole.ADMIN : UserRole.USER,
        },
        { password: DEFAULT_SEED_PASSWORD },
      ),
    );
  }

  const categories: Category[] = [];
  for (const category of SEED_CATEGORIES) {
    categories.push(
      await categoryFactory.create({
        name: category.name,
        slug: `seed-demo-${category.slug}`,
        requiredMeasurements: category.requiredMeasurements,
      }),
    );
  }

  const shops: Shop[] = [];
  for (const [index, data] of SEED_SHOPS.entries()) {
    const shop = await shopFactory.create(data);
    await memberFactory.create({
      shopId: shop.id,
      userId: users[index + 2].id,
    });
    await new ShopRoleService(manager.connection).initializeDefaultRoles(
      shop.id,
      manager,
    );
    shops.push(shop);
  }

  const products: Product[] = [];
  const states = [
    ProductStatus.DRAFT,
    ProductStatus.PENDING_REVIEW,
    ProductStatus.REJECTED,
    ProductStatus.HIDDEN,
    ProductStatus.HELD,
    ProductStatus.SOLD,
  ];
  for (let index = 0; index < 36; index++) {
    const category = categories[index % categories.length];
    const shopIndex = Math.floor(index / categories.length) % shops.length;
    const status = index < 30 ? ProductStatus.ACTIVE : states[index - 30];
    const product = await productFactory.create({
      categoryId: status === ProductStatus.DRAFT ? null : category.id,
      shopId: shops[shopIndex].id,
      title:
        status === ProductStatus.DRAFT
          ? null
          : `${SEED_CATEGORIES[index % categories.length].title} ${Math.floor(index / categories.length) + 1}`,
      description:
        status === ProductStatus.DRAFT
          ? null
          : 'Pre-loved clothing in good condition.',
      condition: status === ProductStatus.DRAFT ? null : ProductCondition.GOOD,
      price:
        status === ProductStatus.DRAFT ? null : 120000 + (index % 12) * 35000,
      status,
      publishedAt: [
        ProductStatus.ACTIVE,
        ProductStatus.HIDDEN,
        ProductStatus.HELD,
        ProductStatus.SOLD,
      ].includes(status)
        ? new Date()
        : null,
      heldUntil:
        status === ProductStatus.HELD ? new Date(Date.now() + 600000) : null,
      soldAt: status === ProductStatus.SOLD ? new Date() : null,
    });
    products.push(product);
    if (status !== ProductStatus.DRAFT) {
      await moderationFactory.create({
        productId: product.id,
        status:
          status === ProductStatus.PENDING_REVIEW
            ? ProductModerationStatus.PENDING
            : status === ProductStatus.REJECTED
              ? ProductModerationStatus.REJECTED
              : ProductModerationStatus.APPROVED,
        reason:
          status === ProductStatus.REJECTED
            ? 'Demo rejection: add a clearer label photo.'
            : null,
      });
    }
    for (const [slot, angle] of ['FRONT', 'BACK', 'DETAIL'].entries()) {
      const item = SEED_CATEGORIES[index % categories.length];
      const media = await mediaFactory.create({
        uploadedById: users[shopIndex + 2].id,
        url: `https://images.unsplash.com/${item.photo}?w=800&fit=crop&q=80&fm=jpg`,
        sizeBytes: item.sizeBytes,
      });
      await linkFactory.create({
        mediaId: media.id,
        ownerId: product.id,
        role: slot === 0 ? MediaRole.COVER : MediaRole.GALLERY,
        angle,
        sortOrder: slot,
      });
    }
  }
  return { users, shops, categories, products };
}
