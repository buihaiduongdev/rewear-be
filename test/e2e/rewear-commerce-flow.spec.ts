import { randomUUID } from 'node:crypto';

import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { CategoryFactory } from '@/database/factories/category.factory';
import { ShopMemberFactory } from '@/database/factories/shop-member.factory';
import { ShopFactory } from '@/database/factories/shop.factory';
import { UserFactory } from '@/database/factories/user.factory';
import { GhnSandboxAdapter } from '@/infrastructure/shipping/adapters/ghn-sandbox.adapter';
import { STORAGE_PROVIDER } from '@/infrastructure/storage/storage.interface';
import type { IStorageProvider } from '@/infrastructure/storage/storage.interface';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { ACCESS_POLICY } from '@/modules/authorization/constants/access-policy.constant';
import { ShopMemberRoleAssignment } from '@/modules/authorization/entities/shop-member-role-assignment.entity';
import { ShopRolePermission } from '@/modules/authorization/entities/shop-role-permission.entity';
import { ShopRole } from '@/modules/authorization/entities/shop-role.entity';
import { Category } from '@/modules/category/entities';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { UserAddress } from '@/modules/user-address/entities';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';
import { UserStatus } from '@/modules/user/enums';

import type { TestDatabase } from '../support/database';
import { createTestDatabase } from '../support/database';

describe('Rewear application commerce flow (HTTP + PostgreSQL)', () => {
  let database: TestDatabase;
  let db: DataSource;
  let app: INestApplication;
  let seller: User;
  let admin: User;
  let buyer: User;
  let category: Category;
  let address: UserAddress;
  let shop: Shop;
  const quoteCarrier = jest
    .fn()
    .mockResolvedValue({ fee: 25000, estimatedDeliveryAt: null });

  const storage: IStorageProvider = {
    async createDownloadUrl() {
      return {
        url: 'https://storage.example.test/private',
        headers: {},
        expiresAt: new Date(Date.now() + 60000),
      };
    },
    async createUploadTicket({ keyPrefix, extension, contentType, sizeBytes }) {
      const key = `${keyPrefix}/${randomUUID()}.${extension}`;
      return {
        key,
        uploadUrl: `https://storage.example.test/${key}`,
        publicUrl: `https://storage.example.test/${key}`,
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Content-Length': `${sizeBytes}`,
        },
        expiresAt: new Date(Date.now() + 60_000),
      };
    },
    getPublicUrl(key) {
      return `https://storage.example.test/${key}`;
    },
    async delete() {},
  };

  beforeAll(async () => {
    database = await createTestDatabase();
    await database.destroy();

    const testAuthGuard = {
      async canActivate(context: ExecutionContext) {
        const policy =
          Reflect.getMetadata(ACCESS_POLICY, context.getHandler()) ??
          Reflect.getMetadata(ACCESS_POLICY, context.getClass());
        if (policy?.type === 'public') return true;
        const request = context.switchToHttp().getRequest();
        const id = request.headers['x-test-user'];
        if (typeof id !== 'string') return false;
        const user = await db.getRepository(User).findOneBy({
          id,
          status: UserStatus.ACTIVE,
        });
        if (!user) return false;
        request.user = user;
        return true;
      },
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JwtAuthGuard)
      .useValue(testAuthGuard)
      .overrideProvider(STORAGE_PROVIDER)
      .useValue(storage)
      .overrideProvider(GhnSandboxAdapter)
      .useValue({ quote: quoteCarrier })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(
      new LoggingInterceptor(),
      new TransformInterceptor(),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    db = app.get(DataSource);

    const userFactory = new UserFactory();
    const categoryFactory = new CategoryFactory();
    const shopFactory = new ShopFactory();
    const memberFactory = new ShopMemberFactory();
    [admin, seller, buyer] = await db
      .getRepository(User)
      .save([
        userFactory.build({ role: UserRole.ADMIN }),
        userFactory.build(),
        userFactory.build(),
      ]);
    shop = await db.getRepository(Shop).save(shopFactory.build());
    await db
      .getRepository(ShopMember)
      .save(memberFactory.build({ shopId: shop.id, userId: seller.id }));
    await db.getRepository(PickupLocation).save({
      ghnShopId: Math.floor(Math.random() * 900000) + 100000,
      ghnSyncStatus: 'CONNECTED',
      shopId: shop.id,
      contactName: 'Seller',
      phone: '0912345678',
      addressLine1: '1 Shop Street',
      countryCode: 'VN',
      provinceId: 202,
      provinceName: 'Ho Chi Minh City',
      districtId: 1442,
      districtName: 'District 1',
      wardCode: '26734',
      wardName: 'Test ward',
    });
    category = await db
      .getRepository(Category)
      .save(categoryFactory.build({ requiredMeasurements: [] }));
    address = await db.getRepository(UserAddress).save({
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
  });

  afterAll(async () => {
    await app?.close();
    await database?.destroy();
  });

  it('lets a seller publish an approved listing that a buyer can hold at checkout', async () => {
    const server = app.getHttpServer();
    for (const module of app.get(ModulesContainer).values()) {
      for (const controller of module.controllers.values()) {
        const type = controller.metatype;
        if (!type) continue;
        for (const name of Object.getOwnPropertyNames(type.prototype)) {
          const handler = type.prototype[name];
          if (
            typeof handler !== 'function' ||
            !Reflect.hasMetadata(METHOD_METADATA, handler)
          )
            continue;
          const policy =
            Reflect.getMetadata(ACCESS_POLICY, handler) ??
            Reflect.getMetadata(ACCESS_POLICY, type);
          expect({
            route: `${type.name}.${name}`,
            configured: Boolean(policy),
          }).toEqual({ route: `${type.name}.${name}`, configured: true });
        }
      }
    }
    const sellerProfile = await request(server)
      .get('/api/users/me')
      .set('x-test-user', seller.id)
      .set('x-shop-id', shop.id)
      .expect(200);
    expect(sellerProfile.body.data.shop).toMatchObject({
      id: shop.id,
      name: shop.name,
      memberRole: 'OWNER',
    });
    const buyerProfile = await request(server)
      .get('/api/users/me')
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .expect(200);
    expect(buyerProfile.body.data.shop).toBeNull();
    await request(server)
      .post(`/api/shops/${shop.id}/roles`)
      .set('x-test-user', seller.id)
      .set('x-shop-id', shop.id)
      .send({ name: 'Escalation', permissions: ['shop.owner'] })
      .expect(400);
    const assignablePermissions = await request(server)
      .get(`/api/shops/${shop.id}/permissions`)
      .set('x-test-user', seller.id)
      .set('x-shop-id', shop.id)
      .expect(200);
    expect(assignablePermissions.body.data).not.toContain('shop.owner');

    await request(server)
      .get(`/api/shops/${shop.id}/roles`)
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .expect(403);
    const staffMembership = await db.getRepository(ShopMember).save({
      shopId: shop.id,
      userId: buyer.id,
      memberRole: ShopMemberRole.STAFF,
    });
    await request(server)
      .get(`/api/shops/${shop.id}/roles`)
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .expect(403);
    await request(server)
      .delete(`/api/shops/${shop.id}/members/${staffMembership.id}`)
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .expect(403);
    await request(server)
      .get(`/api/shops/${shop.id}/permissions/me`)
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .expect(200);
    await request(server)
      .put(`/api/shops/${shop.id}/members/${staffMembership.id}/roles`)
      .set('x-test-user', seller.id)
      .set('x-shop-id', shop.id)
      .send({ roleIds: [] })
      .expect(200);
    const anotherShop = await db
      .getRepository(Shop)
      .save(new ShopFactory().build());
    await request(server)
      .get(`/api/shops/${shop.id}/roles`)
      .set('x-test-user', seller.id)
      .expect(400);
    await request(server)
      .get(`/api/shops/${shop.id}/roles`)
      .set('x-test-user', seller.id)
      .set('x-shop-id', 'invalid')
      .expect(400);
    await request(server)
      .get(`/api/shops/${anotherShop.id}/roles`)
      .set('x-test-user', seller.id)
      .set('x-shop-id', shop.id)
      .expect(404);
    await request(server)
      .post('/api/products')
      .set('x-test-user', seller.id)
      .set('x-shop-id', shop.id)
      .send({ shopId: anotherShop.id, title: 'Wrong scope' })
      .expect(404);
    const foreignProduct = await db
      .getRepository(Product)
      .save({ shopId: anotherShop.id, title: 'Private product' });
    await request(server)
      .get(`/api/products/manage/${foreignProduct.id}`)
      .set('x-test-user', seller.id)
      .set('x-shop-id', shop.id)
      .expect(404);
    const otherMembership = await db.getRepository(ShopMember).save({
      shopId: anotherShop.id,
      userId: admin.id,
      memberRole: ShopMemberRole.OWNER,
    });
    await request(server)
      .put(`/api/shops/${shop.id}/members/${otherMembership.id}/roles`)
      .set('x-test-user', seller.id)
      .set('x-shop-id', shop.id)
      .send({ roleIds: [] })
      .expect(404);
    await request(server)
      .get(`/api/shops/${shop.id}/orders`)
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .expect(403);
    const staffRole = await db
      .getRepository(ShopRole)
      .save({ shopId: shop.id, name: 'Order reader' });
    const rolePermission = await db
      .getRepository(ShopRolePermission)
      .save({ roleId: staffRole.id, permissionKey: 'order.view' });
    await db
      .getRepository(ShopMemberRoleAssignment)
      .save({ memberId: staffMembership.id, roleId: staffRole.id });
    await request(server)
      .get(`/api/shops/${shop.id}/orders`)
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .expect(200);
    await db.getRepository(ShopRolePermission).remove(rolePermission);
    await request(server)
      .get(`/api/shops/${shop.id}/orders`)
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .expect(403);
    await request(server)
      .delete(`/api/shops/${shop.id}/members/${staffMembership.id}`)
      .set('x-test-user', seller.id)
      .set('x-shop-id', shop.id)
      .expect(204);
    const categoryCreated = await request(server)
      .post('/api/categories')
      .set('x-test-user', admin.id)
      .set('x-shop-id', shop.id)
      .send({ name: 'Áo Đầm' })
      .expect(201);
    expect(categoryCreated.body.data.slug).toBe('ao-dam');
    await request(server)
      .post('/api/categories')
      .set('x-test-user', admin.id)
      .set('x-shop-id', shop.id)
      .send({ name: 'Áo Dam' })
      .expect(409);
    await request(server)
      .post('/api/categories')
      .set('x-test-user', admin.id)
      .set('x-shop-id', shop.id)
      .send({ name: 'Áo khoác', slug: 'custom-slug' })
      .expect(400);
    await request(server)
      .post('/api/categories')
      .set('x-test-user', admin.id)
      .set('x-shop-id', shop.id)
      .send({ name: 'Váy đẹp' })
      .expect(201);
    await request(server)
      .patch(`/api/categories/${categoryCreated.body.data.id}`)
      .set('x-test-user', admin.id)
      .set('x-shop-id', shop.id)
      .send({ name: 'Váy đẹp' })
      .expect(409);
    const categoryUpdated = await request(server)
      .patch(`/api/categories/${categoryCreated.body.data.id}`)
      .set('x-test-user', admin.id)
      .set('x-shop-id', shop.id)
      .send({ name: 'Áo mới' })
      .expect(200);
    expect(categoryUpdated.body.data.slug).toBe('ao-moi');
    await request(server)
      .patch(`/api/categories/${categoryCreated.body.data.id}`)
      .set('x-test-user', admin.id)
      .set('x-shop-id', shop.id)
      .send({ slug: 'custom-slug' })
      .expect(400);
    await request(server)
      .post('/api/categories')
      .set('x-test-user', admin.id)
      .set('x-shop-id', shop.id)
      .send({ name: '!!!' })
      .expect(400);
    const openapi = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(openapi.paths['/api/categories'].post?.requestBody).toBeDefined();

    const missingCategory = await request(server)
      .get(`/api/categories/${randomUUID()}`)
      .expect(404);
    expect(missingCategory.body.message).toBe('Resource not found');

    const otherUsersAddress = await request(server)
      .get(`/api/user-addresses/${address.id}`)
      .set('x-test-user', seller.id)
      .set('x-shop-id', shop.id)
      .expect(404);
    expect(otherUsersAddress.body.message).toBe('Resource not found');

    const missingProduct = await request(server)
      .put(`/api/cart/items/${randomUUID()}`)
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .send({})
      .expect(404);
    expect(missingProduct.body.message).toBe('Resource not found');

    await request(server)
      .post('/api/products')
      .set('x-test-user', seller.id)
      .set('x-shop-id', shop.id)
      .send({ title: 'Missing shop' })
      .expect(400);
    await request(server)
      .post('/api/products')
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .send({ shopId: shop.id })
      .expect(403);

    const created = await request(server)
      .post('/api/products')
      .set('x-test-user', seller.id)
      .set('x-shop-id', shop.id)
      .send({
        shopId: shop.id,
        title: 'Denim jacket',
        description: 'A clean jacket in good condition',
        categoryId: category.id,
        condition: 'GOOD',
        price: 250000,
        measurements: {},
        shippingPackage: {
          weightGrams: 500,
          lengthCm: 20,
          widthCm: 15,
          heightCm: 10,
        },
      })
      .expect(201);
    const productId = created.body.data.id as string;
    await request(server)
      .get(`/api/products/manage/${productId}`)
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .expect(403);
    await request(server)
      .get(`/api/products/admin/${productId}/moderation`)
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .expect(403);
    await request(server)
      .get(`/api/shipping/shops/${shop.id}/pickup-location`)
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .expect(403);
    await request(server)
      .get(`/api/shipping/shops/${shop.id}/pickup-location`)
      .set('x-test-user', seller.id)
      .set('x-shop-id', shop.id)
      .expect(200);

    for (const angle of ['FRONT', 'BACK', 'LABEL']) {
      const ticket = await request(server)
        .post('/api/media/upload-ticket')
        .set('x-test-user', seller.id)
        .set('x-shop-id', shop.id)
        .send({ mimeType: 'image/jpeg', sizeBytes: 1024 })
        .expect(201);
      await request(server)
        .post(`/api/products/${productId}/media`)
        .set('x-test-user', seller.id)
        .set('x-shop-id', shop.id)
        .send({
          mediaId: ticket.body.data.id,
          angle,
        })
        .expect(201);
    }

    const submitted = await request(server)
      .post(`/api/products/${productId}/submit`)
      .set('x-test-user', seller.id)
      .set('x-shop-id', shop.id)
      .send({})
      .expect(200);
    expect(submitted.body.data.status).toBe(ProductStatus.PENDING_REVIEW);

    await request(server)
      .patch(`/api/products/${productId}`)
      .set('x-test-user', seller.id)
      .set('x-shop-id', shop.id)
      .send({ title: 'Edited while pending' })
      .expect(409);
    await request(server)
      .post(`/api/products/${productId}/cancel-submission`)
      .set('x-test-user', seller.id)
      .set('x-shop-id', shop.id)
      .send({})
      .expect(200);
    await request(server)
      .post(`/api/products/${productId}/submit`)
      .set('x-test-user', seller.id)
      .set('x-shop-id', shop.id)
      .send({})
      .expect(200);

    const review = await request(server)
      .get(`/api/products/admin/${productId}/moderation`)
      .set('x-test-user', admin.id)
      .set('x-shop-id', shop.id)
      .expect(200);
    const approved = await request(server)
      .post(`/api/products/admin/${productId}/moderation`)
      .set('x-test-user', admin.id)
      .set('x-shop-id', shop.id)
      .send({ version: review.body.data.version, decision: 'APPROVE' })
      .expect(200);
    expect(approved.body.data.status).toBe(ProductStatus.ACTIVE);

    const listing = await request(server)
      .get('/api/products')
      .query({
        limit: '1',
        sortBy: 'price:ASC',
        search: 'Denim',
        'filter.price': '$gte:200000',
      })
      .expect(200);
    expect(listing.body.data.data).toEqual([
      expect.objectContaining({
        id: productId,
        title: 'Denim jacket',
        mediaCount: 3,
      }),
    ]);
    expect(listing.body.data.meta).toMatchObject({
      itemsPerPage: 1,
      totalItems: 1,
      sortBy: [['price', 'ASC']],
    });
    expect(listing.body.data.links.current).toContain('limit=1');

    const cart = await request(server)
      .put(`/api/cart/items/${productId}`)
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .send({})
      .expect(200);
    expect(cart.body.data.groups[0].shop).toMatchObject({
      id: shop.id,
      name: shop.name,
    });
    expect(cart.body.data.groups[0]).not.toHaveProperty('source');

    const checkedOut = await request(server)
      .post('/api/checkouts')
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .send({
        requestId: randomUUID(),
        addressId: address.id,
        productIds: [productId],
      })
      .expect(200);

    expect(checkedOut.body.data).toMatchObject({
      status: 'HELD',
      subtotal: 250000,
      orders: [
        {
          shopId: shop.id,
          shopName: shop.name,
          items: [
            {
              productId,
              title: 'Denim jacket',
              price: 250000,
            },
          ],
        },
      ],
    });
    const quote = await request(server)
      .post(`/api/checkouts/${checkedOut.body.data.id}/shipping-quotes`)
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .send({})
      .expect(200);
    expect(quote.body.data.orders[0].shopId).toBe(shop.id);
    expect(quote.body.data.orders[0]).not.toHaveProperty('sourceType');
    expect(quote.body.data.totalShippingFee).toBe(25000);
    expect(quote.body.data).not.toHaveProperty('id');
    await request(server)
      .post(`/api/checkouts/${checkedOut.body.data.id}/shipping-quotes`)
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .send({})
      .expect(200);
    expect(quoteCarrier).toHaveBeenCalledTimes(2);
    await db.getRepository(Shop).update(shop.id, { name: 'Tên shop mới' });
    const updatedCheckout = await request(server)
      .get(`/api/checkouts/${checkedOut.body.data.id}`)
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .expect(200);
    expect(updatedCheckout.body.data.orders[0].shopName).toBe('Tên shop mới');
    expect(updatedCheckout.body.data).not.toHaveProperty('shippingQuote');
    expect(
      (await db.getRepository(Product).findOneByOrFail({ id: productId }))
        .status,
    ).toBe(ProductStatus.HELD);
    quoteCarrier.mockRejectedValueOnce(new Error('CARRIER_UNAVAILABLE'));
    const unavailable = await request(server)
      .post(`/api/checkouts/${checkedOut.body.data.id}/shipping-quotes`)
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .send({})
      .expect(200);
    expect(unavailable.body.data).toMatchObject({
      status: 'UNAVAILABLE',
      totalShippingFee: null,
      orders: [{ reason: 'CARRIER_UNAVAILABLE' }],
    });
    quoteCarrier.mockImplementationOnce(async () => {
      await request(server)
        .post(`/api/checkouts/${checkedOut.body.data.id}/cancel`)
        .set('x-test-user', buyer.id)
        .set('x-shop-id', shop.id)
        .send({})
        .expect(200);
      return { fee: 25000, estimatedDeliveryAt: null };
    });
    await request(server)
      .post(`/api/checkouts/${checkedOut.body.data.id}/shipping-quotes`)
      .set('x-test-user', buyer.id)
      .set('x-shop-id', shop.id)
      .send({})
      .expect(409);
  });
});
