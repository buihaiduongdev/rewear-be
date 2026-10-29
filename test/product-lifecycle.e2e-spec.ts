import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import request from 'supertest';
import { DataSource } from 'typeorm';

import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { createRequestValidationPipe } from '@/common/validation';
import type { StorageService } from '@/infrastructure/storage';
import { AuthProvider } from '@/modules/auth/enums';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { Category } from '@/modules/category/entities';
import type { ConfigService } from '@/modules/config';
import { Media, MediaLink } from '@/modules/media/entities';
import { MediaOwnerType, MediaRole, MediaType } from '@/modules/media/enums';
import { MediaController } from '@/modules/media/media.controller';
import { MediaService } from '@/modules/media/media.service';
import { Product } from '@/modules/product/entities';
import { ProductCondition, ProductStatus } from '@/modules/product/enums';
import { ProductController } from '@/modules/product/product.controller';
import { ProductService } from '@/modules/product/product.service';
import { findProductSchema, productSchema } from '@/modules/product/schemas';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole, ShopMemberStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

const testUrl = process.env.PRODUCT_TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;

suite('Product lifecycle (real PostgreSQL)', () => {
  let db: DataSource;
  let app: INestApplication;
  let products: ProductService;
  let media: MediaService;
  let seller: User;
  let admin: User;
  let stranger: User;
  let category: Category;
  const storage = {
    delete: jest.fn().mockResolvedValue(undefined),
    getObjectMetadata: jest
      .fn()
      .mockResolvedValue({ contentType: 'image/jpeg', sizeBytes: 1024 }),
    getPublicUrl: (key: string) => `https://media.example.com/${key}`,
    createUploadTicket: jest.fn(),
  };

  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.pathname !== '/rewear_product_test'
    ) {
      throw new Error(
        'Product tests require a dedicated local rewear_product_test database',
      );
    }
    db = await new DataSource({
      type: 'postgres',
      url: testUrl,
      synchronize: true,
      entities: [path.join(__dirname, '../src/modules/**/*.entity.ts')],
    }).initialize();
    products = new ProductService(
      db.getRepository(Product),
      db.getRepository(Category),
      db.getRepository(Shop),
      db.getRepository(ShopMember),
      db,
    );
    media = new MediaService(
      db.getRepository(MediaLink),
      db,
      products,
      storage as unknown as StorageService,
      {
        storage: { allowedTypes: ['image/jpeg'], maxSizeBytes: 10485760 },
      } as ConfigService,
    );
    const module = await Test.createTestingModule({
      controllers: [ProductController, MediaController],
      providers: [
        { provide: ProductService, useValue: products },
        { provide: MediaService, useValue: media },
        { provide: APP_PIPE, useFactory: createRequestValidationPipe },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        async canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest();
          const actor = req.headers['x-test-user'];
          if (typeof actor !== 'string') throw new UnauthorizedException();
          const user = await db
            .getRepository(User)
            .findOneBy({ id: actor, status: UserStatus.ACTIVE });
          if (!user) throw new UnauthorizedException();
          req.user = user;
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  beforeEach(async () => {
    // The URL is validated above; this database contains disposable test data only.
    await db.synchronize(true);
    storage.delete.mockClear();
    const user = (name: string, role = UserRole.USER) =>
      db.getRepository(User).save({
        email: `${name}@example.com`,
        fullName: name,
        provider: AuthProvider.CREDENTIALS,
        role,
        status: UserStatus.ACTIVE,
      });
    seller = await user('seller');
    admin = await user('admin', UserRole.ADMIN);
    stranger = await user('stranger');
    category = await db
      .getRepository(Category)
      .save({ name: 'Tops', slug: 'tops', isActive: true });
  });

  afterAll(async () => {
    await app?.close();
    if (db?.isInitialized) await db.destroy();
  });

  async function draft() {
    return products.create(seller.id, {
      title: 'Denim jacket',
      description: 'Used jacket, no hidden defects',
      categoryId: category.id,
      condition: ProductCondition.GOOD,
      price: 250000,
      measurements: { chest: 50, length: 65 },
    });
  }
  async function attach(product: Product) {
    const links: MediaLink[] = [];
    for (const [index, angle] of ['FRONT', 'BACK', 'LABEL'].entries()) {
      const item = await db.getRepository(Media).save({
        uploadedById: seller.id,
        storageKey: `products/${product.id}/${randomUUID()}.jpg`,
        url: `https://media.example.com/${randomUUID()}.jpg`,
        mediaType: MediaType.IMAGE,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      });
      links.push(
        await db.getRepository(MediaLink).save({
          mediaId: item.id,
          ownerType: MediaOwnerType.PRODUCT,
          ownerId: product.id,
          role: index === 0 ? MediaRole.COVER : MediaRole.GALLERY,
          angle,
          sortOrder: index,
        }),
      );
    }
    return links;
  }
  async function pending() {
    const product = await draft();
    const links = await attach(product);
    return { product: await products.submit(product.id, seller.id), links };
  }
  async function approved() {
    const { product, links } = await pending();
    return {
      product: await products.moderate(product.id, admin.id, {
        revision: product.revision,
        decision: 'APPROVE',
      }),
      links,
    };
  }

  it('enforces HTTP ownership/admin roles and serializes the draft-to-approval contract', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/products').send({}).expect(401);
    const created = await request(server)
      .post('/api/products')
      .set('x-test-user', seller.id)
      .send({})
      .expect(201);
    expect(created.body.data).toMatchObject({
      title: null,
      category: null,
      mediaCount: 0,
    });
    const id = created.body.data.id;
    await request(server)
      .get(`/api/products/manage/${id}`)
      .set('x-test-user', stranger.id)
      .expect(403);
    await request(server)
      .get(`/api/products/${id}/media/manage`)
      .set('x-test-user', seller.id)
      .expect(200);
    await request(server)
      .get('/api/products/admin')
      .set('x-test-user', seller.id)
      .expect(403);
    await request(server)
      .patch(`/api/products/${id}/status`)
      .set('x-test-user', seller.id)
      .send({ status: 'ACTIVE' })
      .expect(409);
    await request(server)
      .patch(`/api/products/${id}/status`)
      .set('x-test-user', seller.id)
      .send({ status: 'SOLD' })
      .expect(400);
    await request(server)
      .post(`/api/products/${id}/submit`)
      .set('x-test-user', seller.id)
      .send({})
      .expect(400);
    const { product } = await pending();
    await request(server)
      .post(`/api/products/admin/${product.id}/moderation`)
      .set('x-test-user', seller.id)
      .send({ revision: product.revision, decision: 'APPROVE' })
      .expect(403);
    await request(server)
      .post(`/api/products/admin/${product.id}/moderation`)
      .set('x-test-user', admin.id)
      .send({ revision: product.revision, decision: 'REJECT' })
      .expect(400);
    const approved = await request(server)
      .post(`/api/products/admin/${product.id}/moderation`)
      .set('x-test-user', admin.id)
      .send({ revision: product.revision, decision: 'APPROVE' })
      .expect(200);
    expect(approved.body).toMatchObject({
      statusCode: 200,
      data: { status: 'ACTIVE', mediaCount: 3 },
    });
    const detail = await request(server)
      .get(`/api/products/${product.id}`)
      .expect(200);
    expect(detail.body.data.coverUrl).toMatch(/^https:/);
    expect(detail.body.data.createdAt).toEqual(expect.any(String));
    expect(detail.body.data).not.toHaveProperty('mediaLinks');
  });

  it('documents nullable drafts, guarded actions and image metadata in OpenAPI', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Product contract')
        .addBearerAuth()
        .build(),
    );
    const paths = doc.paths;
    expect(paths['/api/products/{id}/submit'].post?.responses).toHaveProperty(
      '200',
    );
    expect(paths['/api/products/admin/{id}/moderation'].post?.security).toEqual(
      [{ bearer: [] }],
    );
    expect(
      paths['/api/products/{productId}/media/manage'].get?.security,
    ).toEqual([{ bearer: [] }]);
    if (process.env.PRODUCT_OPENAPI_OUTPUT)
      writeFileSync(
        process.env.PRODUCT_OPENAPI_OUTPUT,
        JSON.stringify(doc, null, 2),
      );
  });

  it('limits shop product management to its active owner', async () => {
    const shop = await db.getRepository(Shop).save({ name: 'Owner shop' });
    await db.getRepository(ShopMember).save([
      {
        shopId: shop.id,
        userId: seller.id,
        memberRole: ShopMemberRole.OWNER,
        status: ShopMemberStatus.ACTIVE,
      },
      {
        shopId: shop.id,
        userId: stranger.id,
        memberRole: ShopMemberRole.STAFF,
        status: ShopMemberStatus.ACTIVE,
      },
    ]);
    const product = await products.create(seller.id, { shopId: shop.id });
    expect(product.sellerUserId).toBeNull();
    expect(product.shopId).toBe(shop.id);
    await expect(
      products.create(stranger.id, { shopId: shop.id }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      products.update(product.id, stranger.id, { title: 'Staff bypass' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      media.findForManagement(product.id, stranger.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await db
      .getRepository(ShopMember)
      .update(
        { shopId: shop.id, userId: seller.id },
        { status: ShopMemberStatus.INACTIVE },
      );
    await expect(
      products.update(product.id, seller.id, { title: 'Revoked owner' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('saves an empty draft and lets only its owner reopen its images', async () => {
    const product = await products.create(seller.id, {});
    expect(productSchema.parse(product)).toMatchObject({
      title: null,
      price: null,
      category: null,
      coverUrl: null,
      mediaCount: 0,
    });
    await attach(product);
    expect(await media.findForManagement(product.id, seller.id)).toHaveLength(
      3,
    );
    await expect(
      media.findForManagement(product.id, stranger.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(media.findAll(product.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(products.submit(product.id, seller.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      products.updateStatus(product.id, seller.id, {
        status: ProductStatus.ACTIVE,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires complete content, three images, front/back angles and attached defect evidence', async () => {
    const product = await draft();
    await expect(products.submit(product.id, seller.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const links = await attach(product);
    await products.update(product.id, seller.id, {
      defects: [{ description: 'Small hole', mediaIds: [randomUUID()] }],
    });
    await expect(products.submit(product.id, seller.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await products.update(product.id, seller.id, {
      defects: [{ description: 'Small hole', mediaIds: [links[0].mediaId] }],
    });
    expect((await products.submit(product.id, seller.id)).status).toBe(
      ProductStatus.PENDING_REVIEW,
    );
  });

  it('enforces category measurement requirements at submission', async () => {
    const product = await draft();
    await attach(product);
    await db
      .getRepository(Category)
      .update(category.id, { requiredMeasurements: ['waist', 'inseam'] });
    await expect(products.submit(product.id, seller.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await products.update(product.id, seller.id, {
      measurements: { waist: 75, inseam: 70 },
    });
    expect((await products.submit(product.id, seller.id)).status).toBe(
      ProductStatus.PENDING_REVIEW,
    );
  });

  it('publishes only the approved revision and returns cover/count in list and detail', async () => {
    const { product } = await pending();
    await expect(products.findOne(product.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      products.moderate(product.id, seller.id, {
        revision: product.revision,
        decision: 'APPROVE',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const active = await products.moderate(product.id, admin.id, {
      revision: product.revision,
      decision: 'APPROVE',
    });
    expect(active.approvedRevision).toBe(product.revision);
    expect(
      productSchema.parse(await products.findOne(product.id)),
    ).toMatchObject({
      mediaCount: 3,
      coverUrl: expect.stringContaining('https://'),
    });
    const list = await products.findAll(findProductSchema.parse({}));
    expect(list.items).toHaveLength(1);
    expect(list.items[0].mediaCount).toBe(3);
    expect(await products.findRevisions(product.id, seller.id)).toEqual([
      expect.objectContaining({ decision: 'APPROVED', reviewedById: admin.id }),
    ]);
  });

  it('keeps approval on a price-only change, invalidates it on content changes and blocks stale review', async () => {
    const { product } = await approved();
    const priceOnly = await products.update(product.id, seller.id, {
      price: 300000,
    });
    expect(priceOnly.status).toBe(ProductStatus.ACTIVE);
    expect(priceOnly.revision).toBe(product.revision);
    await expect(
      products.update(product.id, seller.id, { price: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const edited = await products.update(product.id, seller.id, {
      title: 'Updated description',
    });
    expect(edited.status).toBe(ProductStatus.DRAFT);
    expect(edited.approvedRevision).toBeNull();
    await expect(
      products.updateStatus(product.id, seller.id, {
        status: ProductStatus.ACTIVE,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      products.moderate(product.id, admin.id, {
        revision: product.revision,
        decision: 'APPROVE',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    const resubmitted = await products.submit(product.id, seller.id);
    expect(resubmitted.revision).toBeGreaterThan(product.revision);
  });

  it('confirms an upload only once and retires an unreferenced key before deleting its object', async () => {
    const product = await draft();
    const storageKey = `products/${product.id}/${randomUUID()}.jpg`;
    const input = {
      storageKey,
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      angle: 'FRONT' as const,
    };
    const outcomes = await Promise.allSettled([
      media.confirmUpload(product.id, seller.id, input),
      media.confirmUpload(product.id, seller.id, input),
    ]);
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(await db.getRepository(Media).countBy({ storageKey })).toBe(1);
    const item = await db.getRepository(Media).findOneByOrFail({ storageKey });
    await media.delete(product.id, item.id, seller.id);
    expect(
      (await db.getRepository(Media).findOneByOrFail({ id: item.id }))
        .retiredAt,
    ).toBeInstanceOf(Date);
    expect(storage.delete).toHaveBeenCalledWith(storageKey);
    storage.delete.mockClear();
    await expect(
      media.confirmUpload(product.id, seller.id, input),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('reads media from the approved snapshot even when a listing changes after the public lookup', async () => {
    const { product, links } = await approved();
    const readBeforeEdit = await products.findOne(product.id);
    await media.setCover(product.id, links[1].mediaId, seller.id);
    const approvedLinks = await products.findPublishedMedia(readBeforeEdit);
    expect(
      approvedLinks.find((link) => link.role === MediaRole.COVER)?.mediaId,
    ).toBe(links[0].mediaId);
    await expect(products.findOne(product.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('retains submitted image objects and immutable evidence after deleting a listing image', async () => {
    const { product, links } = await approved();
    const [before] = await products.findRevisions(product.id, seller.id);
    await media.delete(product.id, links[0].mediaId, seller.id);
    expect(
      (await products.findOneForManagement(product.id, seller.id)).status,
    ).toBe(ProductStatus.DRAFT);
    expect(
      await db.getRepository(Media).existsBy({ id: links[0].mediaId }),
    ).toBe(true);
    expect(storage.delete).not.toHaveBeenCalled();
    const [after] = await products.findRevisions(product.id, seller.id);
    expect(after.snapshot).toEqual(before.snapshot);
  });

  it('requires rejection reasons and prevents reactivating rejected or admin-suspended listings', async () => {
    const { product } = await pending();
    await expect(
      products.moderate(product.id, admin.id, {
        revision: product.revision,
        decision: 'REJECT',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const rejected = await products.moderate(product.id, admin.id, {
      revision: product.revision,
      decision: 'REJECT',
      reason: 'Incorrect condition',
    });
    expect(rejected.status).toBe(ProductStatus.REJECTED);
    await expect(
      products.updateStatus(product.id, seller.id, {
        status: ProductStatus.ACTIVE,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await products.update(product.id, seller.id, {
      description: 'Corrected condition',
    });
    const resubmitted = await products.submit(product.id, seller.id);
    await products.moderate(product.id, admin.id, {
      revision: resubmitted.revision,
      decision: 'APPROVE',
    });
    await products.suspend(product.id, admin.id, 'Prohibited item');
    await expect(
      products.update(product.id, seller.id, { title: 'Bypass' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      products.updateStatus(product.id, seller.id, {
        status: ProductStatus.ACTIVE,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([ProductStatus.HELD, ProductStatus.SOLD])(
    'blocks content, price, image and seller status changes on %s',
    async (status) => {
      const { product, links } = await approved();
      await db.getRepository(Product).update(product.id, { status });
      await expect(
        products.update(product.id, seller.id, { price: 1000 }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        products.updateStatus(product.id, seller.id, {
          status: ProductStatus.ACTIVE,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        media.createUploadTicket(product.id, seller.id, {
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        media.reorder(product.id, seller.id, {
          mediaIds: links.map((link) => link.mediaId).reverse(),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        media.delete(product.id, links[0].mediaId, seller.id),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        media.setCover(product.id, links[1].mediaId, seller.id),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        media.confirmUpload(product.id, seller.id, {
          storageKey: `products/${product.id}/${randomUUID()}.jpg`,
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );

  it('serializes concurrent approval and edits so no unapproved content is public', async () => {
    const { product } = await pending();
    await Promise.allSettled([
      products.moderate(product.id, admin.id, {
        revision: product.revision,
        decision: 'APPROVE',
      }),
      products.update(product.id, seller.id, { title: 'Never approved title' }),
    ]);
    const final = await products.findOneForManagement(product.id, seller.id);
    expect(final.title).toBe('Never approved title');
    expect(final.status).toBe(ProductStatus.DRAFT);
    await expect(products.findOne(product.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('serializes concurrent approval and image removal and keeps approved evidence', async () => {
    const { product, links } = await pending();
    await Promise.allSettled([
      products.moderate(product.id, admin.id, {
        revision: product.revision,
        decision: 'APPROVE',
      }),
      media.delete(product.id, links[0].mediaId, seller.id),
    ]);
    const final = await products.findOneForManagement(product.id, seller.id);
    expect(final.status).toBe(ProductStatus.DRAFT);
    expect(final.mediaCount).toBe(2);
    expect(
      await db.getRepository(Media).existsBy({ id: links[0].mediaId }),
    ).toBe(true);
  });

  it('does not let an edit cross a concurrent reservation lock', async () => {
    const { product } = await approved();
    let release!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reservation = db.transaction(async (manager) => {
      const row = await manager.findOneOrFail(Product, {
        where: { id: product.id },
        lock: { mode: 'pessimistic_write' },
      });
      row.status = ProductStatus.HELD;
      await manager.save(row);
      locked();
      await gate;
    });
    await ready;
    const edit = products.update(product.id, seller.id, { price: 1 });
    release();
    await reservation;
    await expect(edit).rejects.toBeInstanceOf(ConflictException);
    expect(
      (await db.getRepository(Product).findOneByOrFail({ id: product.id }))
        .price,
    ).toBe(250000);
  });

  it('prevents concurrent submissions from exceeding 50 live personal listings', async () => {
    await db.getRepository(Product).save(
      Array.from({ length: 49 }, () => ({
        sellerUserId: seller.id,
        categoryId: category.id,
        title: 'Existing',
        price: 1000,
        condition: ProductCondition.GOOD,
        status: ProductStatus.ACTIVE,
      })),
    );
    const first = await draft();
    const second = await draft();
    await attach(first);
    await attach(second);
    const outcomes = await Promise.allSettled([
      products.submit(first.id, seller.id),
      products.submit(second.id, seller.id),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === 'rejected'),
    ).toHaveLength(1);
  });
});
