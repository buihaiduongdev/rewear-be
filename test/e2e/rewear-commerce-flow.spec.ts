import { randomUUID } from 'node:crypto';

import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { STORAGE_PROVIDER } from '@/infrastructure/storage/storage.interface';
import type { IStorageProvider } from '@/infrastructure/storage/storage.interface';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { Category } from '@/modules/category/entities';
import { MarketplaceFactory } from '@/modules/database/seeds/factories/marketplace.factory';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { UserAddress } from '@/modules/user-address/entities';
import { User } from '@/modules/user/entities';
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

  const storage: IStorageProvider = {
    async createUploadTicket({ key, contentType, sizeBytes }) {
      return {
        storageKey: key,
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
    async getObjectMetadata() {
      return { contentType: 'image/jpeg', sizeBytes: 1024 };
    },
    getPublicUrl(key) {
      return `https://storage.example.test/${key}`;
    },
    async delete() {},
  };

  beforeAll(async () => {
    database = await createTestDatabase();
    await database.destroy();

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        async canActivate(context: ExecutionContext) {
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
      })
      .overrideProvider(STORAGE_PROVIDER)
      .useValue(storage)
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

    const factory = new MarketplaceFactory('app-commerce-e2e');
    [admin, seller, buyer] = await db
      .getRepository(User)
      .save([
        factory.user(0, 'unused'),
        factory.user(1, 'unused'),
        factory.user(2, 'unused'),
      ]);
    shop = await db.getRepository(Shop).save(factory.shop(0));
    await db
      .getRepository(ShopMember)
      .save(factory.shopMember(0, shop.id, seller.id));
    category = await db
      .getRepository(Category)
      .save(factory.category(0, { requiredMeasurements: [] }));
    address = await db.getRepository(UserAddress).save({
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
  });

  afterAll(async () => {
    await app?.close();
    await database?.destroy();
  });

  it('lets a seller publish an approved listing that a buyer can hold at checkout', async () => {
    const server = app.getHttpServer();
    const categoryCreated = await request(server)
      .post('/api/categories')
      .set('x-test-user', admin.id)
      .send({ name: 'Áo Đầm' })
      .expect(201);
    expect(categoryCreated.body.data.slug).toBe('ao-dam');
    await request(server)
      .post('/api/categories')
      .set('x-test-user', admin.id)
      .send({ name: 'Áo Dam' })
      .expect(409);
    await request(server)
      .post('/api/categories')
      .set('x-test-user', admin.id)
      .send({ name: 'Áo khoác', slug: 'custom-slug' })
      .expect(400);
    await request(server)
      .post('/api/categories')
      .set('x-test-user', admin.id)
      .send({ name: 'Váy đẹp' })
      .expect(201);
    await request(server)
      .patch(`/api/categories/${categoryCreated.body.data.id}`)
      .set('x-test-user', admin.id)
      .send({ name: 'Váy đẹp' })
      .expect(409);
    const categoryUpdated = await request(server)
      .patch(`/api/categories/${categoryCreated.body.data.id}`)
      .set('x-test-user', admin.id)
      .send({ name: 'Áo mới' })
      .expect(200);
    expect(categoryUpdated.body.data.slug).toBe('ao-moi');
    await request(server)
      .patch(`/api/categories/${categoryCreated.body.data.id}`)
      .set('x-test-user', admin.id)
      .send({ slug: 'custom-slug' })
      .expect(400);
    await request(server)
      .post('/api/categories')
      .set('x-test-user', admin.id)
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
      .expect(404);
    expect(otherUsersAddress.body.message).toBe('Resource not found');

    const missingProduct = await request(server)
      .put(`/api/cart/items/${randomUUID()}`)
      .set('x-test-user', buyer.id)
      .send({})
      .expect(404);
    expect(missingProduct.body.message).toBe('Resource not found');

    await request(server)
      .post('/api/products')
      .set('x-test-user', seller.id)
      .send({ title: 'Missing shop' })
      .expect(400);
    await request(server)
      .post('/api/products')
      .set('x-test-user', buyer.id)
      .send({ shopId: shop.id })
      .expect(403);

    const created = await request(server)
      .post('/api/products')
      .set('x-test-user', seller.id)
      .send({
        shopId: shop.id,
        title: 'Denim jacket',
        description: 'A clean jacket in good condition',
        categoryId: category.id,
        condition: 'GOOD',
        price: 250000,
        measurements: {},
      })
      .expect(201);
    const productId = created.body.data.id as string;

    for (const angle of ['FRONT', 'BACK', 'LABEL']) {
      const ticket = await request(server)
        .post(`/api/products/${productId}/media/upload-ticket`)
        .set('x-test-user', seller.id)
        .send({ mimeType: 'image/jpeg', sizeBytes: 1024 })
        .expect(201);
      await request(server)
        .post(`/api/products/${productId}/media`)
        .set('x-test-user', seller.id)
        .send({
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          storageKey: ticket.body.data.storageKey,
          angle,
        })
        .expect(201);
    }

    const submitted = await request(server)
      .post(`/api/products/${productId}/submit`)
      .set('x-test-user', seller.id)
      .send({})
      .expect(200);
    expect(submitted.body.data.status).toBe(ProductStatus.PENDING_REVIEW);

    const approved = await request(server)
      .post(`/api/products/admin/${productId}/moderation`)
      .set('x-test-user', admin.id)
      .send({ revision: submitted.body.data.revision, decision: 'APPROVE' })
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

    await request(server)
      .put(`/api/cart/items/${productId}`)
      .set('x-test-user', buyer.id)
      .send({})
      .expect(200);

    const checkedOut = await request(server)
      .post('/api/checkouts')
      .set('x-test-user', buyer.id)
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
      .send({})
      .expect(200);
    expect(quote.body.data.orders[0].shopId).toBe(shop.id);
    expect(quote.body.data.orders[0]).not.toHaveProperty('sourceType');
    expect(
      (await db.getRepository(Product).findOneByOrFail({ id: productId }))
        .status,
    ).toBe(ProductStatus.HELD);
  });
});
