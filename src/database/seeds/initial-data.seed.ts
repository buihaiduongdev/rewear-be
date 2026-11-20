import type { EntityManager } from 'typeorm';

import { CartItemFactory } from '@/database/factories/cart-item.factory';
import { CartFactory } from '@/database/factories/cart.factory';
import { CategoryFactory } from '@/database/factories/category.factory';
import { MediaLinkFactory } from '@/database/factories/media-link.factory';
import { MediaFactory } from '@/database/factories/media.factory';
import { PickupLocationFactory } from '@/database/factories/pickup-location.factory';
import { ProductModerationFactory } from '@/database/factories/product-moderation.factory';
import { ProductFactory } from '@/database/factories/product.factory';
import { ShopMemberFactory } from '@/database/factories/shop-member.factory';
import { ShopFactory } from '@/database/factories/shop.factory';
import { UserAddressFactory } from '@/database/factories/user-address.factory';
import { UserFactory } from '@/database/factories/user.factory';
import { ShopRoleService } from '@/modules/authorization/shop-role.service';
import { Cart, CartItem } from '@/modules/cart/entities';
import { Category } from '@/modules/category/entities';
import { Media, MediaLink } from '@/modules/media/entities';
import { MediaRole } from '@/modules/media/enums';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductCondition,
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { UserAddress } from '@/modules/user-address/entities';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import {
  DEFAULT_SEED_PASSWORD,
  SEED_ACCOUNTS,
  SEED_CATEGORIES,
  SEED_PICKUP_LOCATIONS,
  SEED_SHOPS,
  SEED_USER_ADDRESSES,
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
  const userAddressFactory = new UserAddressFactory(
    manager.getRepository(UserAddress),
  );
  const pickupLocationFactory = new PickupLocationFactory(
    manager.getRepository(PickupLocation),
  );
  const cartFactory = new CartFactory(manager.getRepository(Cart));
  const cartItemFactory = new CartItemFactory(manager.getRepository(CartItem));

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
      shippingPackage:
        status === ProductStatus.DRAFT
          ? null
          : {
              weightGrams: 300 + (index % 5) * 50,
              lengthCm: 25,
              widthCm: 20,
              heightCm: 5,
            },
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

  const userByKey = new Map<string, User>();
  for (const [index, account] of SEED_ACCOUNTS.entries()) {
    userByKey.set(account.key, users[index]);
  }

  const userAddresses: UserAddress[] = [];
  for (const addressData of SEED_USER_ADDRESSES) {
    const user = userByKey.get(addressData.accountKey);
    if (!user) continue;
    userAddresses.push(
      await userAddressFactory.create({
        userId: user.id,
        recipientName: addressData.recipientName,
        phone: addressData.phone,
        addressLine1: addressData.addressLine1,
        provinceCode: addressData.provinceCode,
        provinceName: addressData.provinceName,
        wardCode: addressData.wardCode,
        wardName: addressData.wardName,
        label: addressData.label ?? null,
        countryCode: 'VN',
        isDefault: addressData.isDefault,
      }),
    );
  }

  const pickupLocations: PickupLocation[] = [];
  for (const locationData of SEED_PICKUP_LOCATIONS) {
    const shop = shops[locationData.shopIndex];
    if (!shop) continue;
    pickupLocations.push(
      await pickupLocationFactory.create({
        shopId: shop.id,
        contactName: locationData.contactName,
        phone: locationData.phone,
        addressLine1: locationData.addressLine1,
        provinceCode: locationData.provinceCode,
        provinceName: locationData.provinceName,
        wardCode: locationData.wardCode,
        wardName: locationData.wardName,
        countryCode: 'VN',
      }),
    );
  }

  // Seed cart with initial items for demo accounts (Admin and Buyer)
  const admin = users[0];
  const buyer = users[1];
  const adminCart = await cartFactory.create({ userId: admin.id });
  const buyerCart = await cartFactory.create({ userId: buyer.id });

  const adminCartItems: CartItem[] = [
    await cartItemFactory.create({
      cartId: adminCart.id,
      productId: products[0].id,
    }),
    await cartItemFactory.create({
      cartId: adminCart.id,
      productId: products[1].id,
    }),
    await cartItemFactory.create({
      cartId: adminCart.id,
      productId: products[6].id,
    }),
  ];

  const buyerCartItems: CartItem[] = [
    await cartItemFactory.create({
      cartId: buyerCart.id,
      productId: products[2].id,
    }),
    await cartItemFactory.create({
      cartId: buyerCart.id,
      productId: products[7].id,
    }),
  ];

  const carts: Cart[] = [adminCart, buyerCart];
  const cartItems: CartItem[] = [...adminCartItems, ...buyerCartItems];

  return {
    users,
    shops,
    categories,
    products,
    userAddresses,
    pickupLocations,
    carts,
    cartItems,
    cart: adminCart,
  };
}
