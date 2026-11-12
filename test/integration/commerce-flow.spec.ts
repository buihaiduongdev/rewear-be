import { randomUUID } from 'node:crypto';

import { AdministrativeDivisionService } from '@/modules/administrative-division/administrative-division.service';
import { CartService } from '@/modules/cart/cart.service';
import { Category } from '@/modules/category/entities';
import { CheckoutService } from '@/modules/checkout/checkout.service';
import { MarketplaceFactory } from '@/modules/database/seeds/factories/marketplace.factory';
import { Media, MediaLink } from '@/modules/media/entities';
import { MediaOwnerType, MediaRole, MediaType } from '@/modules/media/enums';
import { Product } from '@/modules/product/entities';
import { ProductCondition, ProductStatus } from '@/modules/product/enums';
import { ProductService } from '@/modules/product/product.service';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { PickupLocationService } from '@/modules/shipping/pickup-location.service';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { UserAddress } from '@/modules/user-address/entities';
import { User } from '@/modules/user/entities';

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
    const factory = new MarketplaceFactory('commerce-integration');
    const [admin, seller, buyer] = await db
      .getRepository(User)
      .save([
        factory.user(0, 'unused'),
        factory.user(1, 'unused'),
        factory.user(2, 'unused'),
      ]);
    const category = await db
      .getRepository(Category)
      .save(factory.category(0, { requiredMeasurements: [] }));
    const address = await db.getRepository(UserAddress).save({
      userId: buyer.id,
      recipientName: 'Buyer',
      label: null,
      phone: '0912345678',
      addressLine1: '10 Test Street',
      addressLine2: null,
      countryCode: 'VN',
      provinceCode: '79',
      provinceName: 'Ho Chi Minh City',
      wardCode: '26734',
      wardName: 'Test ward',
      postalCode: null,
      deliveryInstructions: null,
      isDefault: true,
    });

    const products = new ProductService(
      db.getRepository(Product),
      db.getRepository(Category),
      db.getRepository(Shop),
      db.getRepository(ShopMember),
      db,
    );
    const product = await products.create(seller.id, {
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
        url: `https://media.example.test/${randomUUID()}.jpg`,
        mediaType: MediaType.IMAGE,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        eTag: null,
        retiredAt: null,
      });
      await db.getRepository(MediaLink).save({
        mediaId: media.id,
        ownerType: MediaOwnerType.PRODUCT,
        ownerId: product.id,
        role: sortOrder === 0 ? MediaRole.COVER : MediaRole.GALLERY,
        angle,
        sortOrder,
      });
    }

    const pending = await products.submit(product.id, seller.id);
    expect(pending.status).toBe(ProductStatus.PENDING_REVIEW);
    const published = await products.moderate(product.id, admin.id, {
      revision: pending.revision,
      decision: 'APPROVE',
    });
    expect(published.status).toBe(ProductStatus.ACTIVE);

    const cart = new CartService(db);
    const cartView = await cart.add(buyer.id, product.id);
    expect(cartView.summary).toMatchObject({
      itemCount: 1,
      totalPrice: 250000,
    });

    const checkout = new CheckoutService(db, cart);
    const held = await checkout.create(buyer.id, {
      requestId: randomUUID(),
      addressId: address.id,
      productIds: [product.id],
    });
    expect(held.status).toBe('HELD');
    expect(held.orders).toHaveLength(1);
    expect(held.orders[0].items[0]).toMatchObject({
      productId: product.id,
      title: 'Denim jacket',
      price: 250000,
    });
    expect(
      (await db.getRepository(Product).findOneByOrFail({ id: product.id }))
        .status,
    ).toBe(ProductStatus.HELD);
  });

  it('creates and updates one personal pickup location with canonical address names', async () => {
    const factory = new MarketplaceFactory('pickup-integration');
    const user = await db.getRepository(User).save(factory.user(1, 'unused'));
    const divisions = new AdministrativeDivisionService();
    const pickup = new PickupLocationService(db, divisions);
    const wardCode = divisions.findWardsByProvinceCode('01')[0].code;

    const first = await pickup.save(user.id, {
      contactName: 'Pickup contact',
      phone: '0912345678',
      addressLine1: '45 Test Street',
      provinceCode: '01',
      wardCode,
    });
    const updated = await pickup.save(user.id, {
      contactName: 'Updated contact',
      phone: '0912345678',
      addressLine1: '45 Test Street',
      provinceCode: '01',
      wardCode,
    });

    expect(updated.location.id).toBe(first.location.id);
    expect(updated.location).toMatchObject({
      userId: user.id,
      shopId: null,
      contactName: 'Updated contact',
      countryCode: 'VN',
      provinceName: divisions.resolveAddress('01', wardCode).provinceName,
    });
    expect(
      await db.getRepository(PickupLocation).countBy({ userId: user.id }),
    ).toBe(1);
  });
});
