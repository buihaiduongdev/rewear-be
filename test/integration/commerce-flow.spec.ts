import { randomUUID } from 'node:crypto';

import { CategoryFactory } from '@/database/factories/category.factory';
import { ShopMemberFactory } from '@/database/factories/shop-member.factory';
import { ShopFactory } from '@/database/factories/shop.factory';
import { UserFactory } from '@/database/factories/user.factory';
import { GhnShopClient } from '@/infrastructure/shipping/clients/ghn-shop.client';
import { AdministrativeDivisionService } from '@/modules/administrative-division/administrative-division.service';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { CartService } from '@/modules/cart/cart.service';
import { Category } from '@/modules/category/entities';
import { CheckoutService } from '@/modules/checkout/checkout.service';
import { CoinService } from '@/modules/coins/core/coin.service';
import { OutboxService } from '@/modules/event/outbox.service';
import { Media, ProductMedia } from '@/modules/media/entities';
import { MediaRole, MediaType } from '@/modules/media/enums';
import { Product } from '@/modules/product/entities';
import { ProductCondition, ProductStatus } from '@/modules/product/enums';
import { ProductService } from '@/modules/product/product.service';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { PickupLocationService } from '@/modules/shipping/pickup-location.service';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { UserAddress } from '@/modules/user-address/entities';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import type { TestDatabase } from '../support/database';
import { createTestDatabase } from '../support/database';

describe('commerce behavior with PostgreSQL', () => {
  let database: TestDatabase;
  let db: TestDatabase['dataSource'];

  beforeAll(async () => {
    database = await createTestDatabase();
    db = database.dataSource;
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it('publishes a reviewed product, adds it to a cart, then holds it at checkout', async () => {
    const userFactory = new UserFactory();
    const categoryFactory = new CategoryFactory();
    const shopFactory = new ShopFactory();
    const memberFactory = new ShopMemberFactory();
    const [admin, seller, buyer] = await db
      .getRepository(User)
      .save([
        userFactory.build({ role: UserRole.ADMIN }),
        userFactory.build(),
        userFactory.build(),
      ]);
    const category = await db
      .getRepository(Category)
      .save(categoryFactory.build({ requiredMeasurements: [] }));
    const address = await db.getRepository(UserAddress).save({
      userId: buyer.id,
      recipientName: 'Buyer',
      label: null,
      phone: '0912345678',
      addressLine1: '10 Test Street',
      addressLine2: null,
      countryCode: 'VN',
      provinceId: 202,
      provinceName: 'Ho Chi Minh City',
      districtId: 1442,
      districtName: 'District 1',
      wardCode: '26734',
      wardName: 'Test ward',
      postalCode: null,
      deliveryInstructions: null,
      isDefault: true,
    });

    const shop = await db.getRepository(Shop).save(shopFactory.build());
    await db
      .getRepository(ShopMember)
      .save(memberFactory.build({ shopId: shop.id, userId: seller.id }));

    const products = new ProductService(
      db.getRepository(Product),
      db.getRepository(Category),
      db.getRepository(Shop),
      db.getRepository(ShopMember),
      db,
      new AuthorizationService(db),
      { getPublicUrl: (key: string) => `https://public.test/${key}` } as never,
      new OutboxService(),
    );
    const product = await products.create(seller.id, {
      shopId: shop.id,
      title: 'Denim jacket',
      description: 'A clean jacket in good condition',
      categoryId: category.id,
      condition: ProductCondition.GOOD,
      price: 250000,
      measurements: {},
    });

    for (const [sortOrder, angle] of ['FRONT', 'BACK', 'LABEL'].entries()) {
      const media = await db.getRepository(Media).save({
        uploadedById: seller.id,
        storageKey: `products/${product.id}/${randomUUID()}.jpg`,
        mediaType: MediaType.IMAGE,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        retiredAt: null,
      });
      await db.getRepository(ProductMedia).save({
        mediaId: media.id,
        productId: product.id,
        role: sortOrder === 0 ? MediaRole.COVER : MediaRole.GALLERY,
        angle,
        sortOrder,
      });
    }

    const pending = await products.submit(product.id);
    expect(pending.status).toBe(ProductStatus.PENDING_REVIEW);
    const firstReview = await products.findModeration(product.id);
    await expect(
      products.update(product.id, seller.id, { title: 'Changed jacket' }),
    ).rejects.toThrow('This product cannot be edited in its current state');
    await expect(
      new AuthorizationService(db).authorize(
        buyer.id,
        shop.id,
        'product.update',
      ),
    ).rejects.toThrow('Shop permission denied');
    const cancelled = await products.cancelSubmission(product.id);
    expect(cancelled.status).toBe(ProductStatus.DRAFT);
    await products.submit(product.id);
    const secondReview = await products.findModeration(product.id);
    expect(secondReview.id).toBe(firstReview.id);
    expect(secondReview.version).toBeGreaterThan(firstReview.version);
    await expect(
      products.moderate(product.id, admin.id, {
        version: firstReview.version,
        decision: 'APPROVE',
      }),
    ).rejects.toThrow('The submitted review is no longer current');
    const rejected = await products.moderate(product.id, admin.id, {
      version: secondReview.version,
      decision: 'REJECT',
      reason: 'Ảnh chưa rõ',
    });
    expect(rejected.status).toBe(ProductStatus.REJECTED);
    expect((await products.findModeration(product.id)).reason).toBe(
      'Ảnh chưa rõ',
    );
    await products.update(product.id, seller.id, {
      title: 'Denim jacket updated',
    });
    await products.submit(product.id);
    const finalReview = await products.findModeration(product.id);
    expect(finalReview.reason).toBeNull();
    const published = await products.moderate(product.id, admin.id, {
      version: finalReview.version,
      decision: 'APPROVE',
    });
    expect(published.status).toBe(ProductStatus.ACTIVE);

    const cart = new CartService(db, {
      getPublicUrl: (key: string) => `https://public.test/${key}`,
    } as never);
    const cartView = await cart.add(buyer.id, product.id);
    expect(cartView.summary).toMatchObject({
      itemCount: 1,
      totalPrice: 250000,
    });

    const checkout = new CheckoutService(db, cart, new CoinService(db));
    const held = await checkout.create(buyer.id, {
      requestId: randomUUID(),
      addressId: address.id,
      productIds: [product.id],
    });
    expect(held.status).toBe('HELD');
    expect(held.orders).toHaveLength(1);
    expect(held.orders[0].shopId).toBe(shop.id);
    expect(held.orders[0].items[0]).toMatchObject({
      productId: product.id,
      title: 'Denim jacket updated',
      price: 250000,
    });
    expect(
      (await db.getRepository(Product).findOneByOrFail({ id: product.id }))
        .status,
    ).toBe(ProductStatus.HELD);
  });

  it('creates and updates one shop pickup location with canonical address names', async () => {
    const userFactory = new UserFactory();
    const shopFactory = new ShopFactory();
    const memberFactory = new ShopMemberFactory();
    const user = await db.getRepository(User).save(userFactory.build());
    const shop = await db.getRepository(Shop).save(shopFactory.build());
    await db
      .getRepository(ShopMember)
      .save(memberFactory.build({ shopId: shop.id, userId: user.id }));
    const mockGhn = {
      provinces: jest.fn().mockResolvedValue([{ id: 201, name: 'Hà Nội' }]),
      districts: jest
        .fn()
        .mockResolvedValue([{ id: 1489, name: 'Quận Hoàn Kiếm' }]),
      wards: jest
        .fn()
        .mockResolvedValue([{ id: '1A0206', name: 'Phường Hàng Bài' }]),
      create: jest.fn().mockResolvedValue({ status: 'CREATED', shopId: 12345 }),
      findOwnedShop: jest.fn().mockResolvedValue({ _id: 12345, status: 1 }),
    } as unknown as GhnShopClient;
    const divisions = new AdministrativeDivisionService(mockGhn);
    const pickup = new PickupLocationService(db, divisions, mockGhn);
    const provinceId = 201;
    const districtId = 1489;
    const wardCode = '1A0206';

    const first = await pickup.save(
      user.id,
      {
        contactName: 'Pickup contact',
        phone: '0912345678',
        addressLine1: '45 Test Street',
        provinceId,
        districtId,
        wardCode,
      },
      shop.id,
    );
    const updated = await pickup.save(
      user.id,
      {
        contactName: 'Updated contact',
        phone: '0912345678',
        addressLine1: '45 Test Street',
        provinceId,
        districtId,
        wardCode,
      },
      shop.id,
    );

    expect(updated.location.id).toBe(first.location.id);
    expect(updated.location).toMatchObject({
      shopId: shop.id,
      contactName: 'Updated contact',
      countryCode: 'VN',
      provinceId: 201,
      districtId: 1489,
      wardCode: '1A0206',
    });
    expect(
      await db.getRepository(PickupLocation).countBy({ shopId: shop.id }),
    ).toBe(1);
  });
});
