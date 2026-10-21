import { writeFileSync } from 'node:fs';

import { ExecutionContext } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import request from 'supertest';

import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { createRequestValidationPipe } from '@/common/validation';
import { AdministrativeDivisionController } from '@/modules/administrative-division/administrative-division.controller';
import { AdministrativeDivisionService } from '@/modules/administrative-division/administrative-division.service';
import { AuthController } from '@/modules/auth/auth.controller';
import { AuthService } from '@/modules/auth/auth.service';
import { AuthProvider } from '@/modules/auth/enums';
import {
  AuthLoginGuard,
  JwtAuthGuard,
  RolesGuard,
} from '@/modules/auth/guards';
import { AuthStrategyFactory } from '@/modules/auth/strategies/auth-strategy';
import { CategoryController } from '@/modules/category/category.controller';
import { CategoryService } from '@/modules/category/category.service';
import { MediaController } from '@/modules/media/media.controller';
import { MediaService } from '@/modules/media/media.service';
import { ProductController } from '@/modules/product/product.controller';
import { ProductService } from '@/modules/product/product.service';
import { ShopController } from '@/modules/shop/shop.controller';
import { ShopService } from '@/modules/shop/shop.service';
import { UserAddressController } from '@/modules/user-address/user-address.controller';
import { UserAddressService } from '@/modules/user-address/user-address.service';
import { UserRole, UserStatus } from '@/modules/user/enums';
import { UserController } from '@/modules/user/user.controller';
import { UserService } from '@/modules/user/user.service';

describe('Native request validation and OpenAPI (HTTP, mocked persistence)', () => {
  let app: INestApplication;
  const id = '598745cf-8764-499a-ad43-e6223713ee90';
  const now = new Date('2026-10-20T00:00:00.000Z');
  const user = {
    id,
    email: 'an@example.com',
    fullName: 'An',
    provider: AuthProvider.CREDENTIALS,
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    createdAt: now,
    updatedAt: now,
    password: 'private',
  };
  const category = {
    id,
    name: 'Áo',
    slug: 'ao',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    internalSecret: 'private',
  };
  const auth = {
    register: jest.fn(),
    login: jest.fn().mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      user,
    }),
  };
  const categories = {
    create: jest.fn().mockResolvedValue(category),
    findOne: jest.fn(),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const products = {
    create: jest.fn(),
    findAll: jest.fn().mockResolvedValue({
      items: [],
      meta: {
        page: 2,
        pageSize: 3,
        total: 0,
        totalPage: 0,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    }),
  };
  const addresses = { create: jest.fn() };
  const shops = { create: jest.fn() };
  const media = { createUploadTicket: jest.fn() };
  const users = { create: jest.fn() };
  const strategy = { validate: jest.fn().mockResolvedValue(user) };
  const strategies = { getStrategy: jest.fn().mockReturnValue(strategy) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        AdministrativeDivisionController,
        AuthController,
        CategoryController,
        ProductController,
        UserAddressController,
        ShopController,
        MediaController,
        UserController,
      ],
      providers: [
        AdministrativeDivisionService,
        { provide: APP_PIPE, useFactory: createRequestValidationPipe },
        { provide: AuthService, useValue: auth },
        { provide: CategoryService, useValue: categories },
        { provide: ProductService, useValue: products },
        { provide: UserAddressService, useValue: addresses },
        { provide: ShopService, useValue: shops },
        { provide: MediaService, useValue: media },
        { provide: UserService, useValue: users },
        { provide: AuthStrategyFactory, useValue: strategies },
        AuthLoginGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = user;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('Rewear').setVersion('1').build(),
      ),
    );
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => {
    await app?.close();
  });

  it.each([
    [
      '/api/auth/register',
      { email: 'invalid', password: 'short', fullName: 'An' },
    ],
    [
      '/api/users',
      {
        email: 'an@example.com',
        password: '12345678',
        fullName: 'An',
        role: 'OWNER',
      },
    ],
    ['/api/categories', { name: 'Áo', extra: true }],
    ['/api/shops', { name: '   ' }],
    [
      '/api/products',
      { categoryId: id, title: 'Áo', condition: 'GOOD', price: '100' },
    ],
    ['/api/user-addresses', { recipientName: 'An' }],
    [
      `/api/products/${id}/media/upload-ticket`,
      { mimeType: 'image/jpeg', sizeBytes: '100' },
    ],
  ])('rejects invalid body at %s before persistence', async (url, body) => {
    const result = await request(app.getHttpServer())
      .post(url)
      .send(body)
      .expect(400);
    expect(result.body).toMatchObject({
      statusCode: 400,
      message: expect.any(Array),
      errors: expect.any(Array),
    });
    for (const service of [
      auth,
      categories,
      products,
      addresses,
      shops,
      media,
      users,
    ]) {
      for (const method of Object.values(service))
        expect(method).not.toHaveBeenCalled();
    }
  });

  it('preserves 201/envelope, ISO dates and sensitive-field serialization', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/categories')
      .send({ name: 'Áo' })
      .expect(201);
    expect(categories.create).toHaveBeenCalledWith({ name: 'Áo' });
    expect(result.body).toEqual({
      statusCode: 201,
      message: 'OK',
      data: {
        ...category,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        internalSecret: undefined,
      },
    });
    expect(result.body.data).not.toHaveProperty('internalSecret');
  });

  it('coerces query numbers and defaults through the global native pipe', async () => {
    await request(app.getHttpServer())
      .get('/api/products?page=2&pageSize=3&minPrice=0&maxPrice=100')
      .expect(200);
    expect(products.findAll).toHaveBeenCalledWith({
      page: 2,
      pageSize: 3,
      order: 'DESC',
      minPrice: 0,
      maxPrice: 100,
    });
  });

  it('preserves an empty HTTP 204 response', async () => {
    const result = await request(app.getHttpServer())
      .delete(`/api/categories/${id}`)
      .expect(204);
    expect(result.text).toBe('');
    expect(categories.remove).toHaveBeenCalledWith(id);
  });

  it('reports the correct field path for duplicate media without invoking persistence', async () => {
    const result = await request(app.getHttpServer())
      .patch(`/api/products/${id}/media/order`)
      .send({ mediaIds: [id, id] })
      .expect(400);
    expect(result.body.errors[0].path).toEqual(['mediaIds']);
    expect(result.body.message[0]).toContain('mediaIds:');
  });

  it.each(['page=0', 'pageSize=101', 'minPrice=100&maxPrice=1', 'unknown=1'])(
    'rejects invalid query %s',
    async (query) => {
      await request(app.getHttpServer())
        .get('/api/products?' + query)
        .expect(400);
      expect(products.findAll).not.toHaveBeenCalled();
    },
  );

  it('validates UUID params before persistence', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/categories/not-a-uuid')
      .expect(400);
    expect(result.body.errors[0].path).toEqual([]);
    expect(categories.findOne).not.toHaveBeenCalled();
  });

  it('validates login before selecting a strategy and keeps valid login at 200', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ provider: 'UNKNOWN', token: {} })
      .expect(400);
    expect(strategies.getStrategy).not.toHaveBeenCalled();
    const result = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        provider: AuthProvider.CREDENTIALS,
        email: user.email,
        password: '12345678',
      })
      .expect(200);
    expect(strategy.validate).toHaveBeenCalledWith({
      provider: AuthProvider.CREDENTIALS,
      email: user.email,
      password: '12345678',
    });
    expect(result.body.data.user).not.toHaveProperty('password');
  });

  it('serves request/query/param and serialized response OpenAPI from the schemas', async () => {
    const { body: document } = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    writeFileSync(
      '/tmp/rewear-standard-schema-openapi.json',
      JSON.stringify(document, null, 2),
    );
    const body = (path: string, method = 'post') =>
      (document.paths[path] as Record<string, any>)[method].requestBody.content[
        'application/json'
      ].schema;
    expect(body('/api/products')).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: expect.arrayContaining([
        'categoryId',
        'title',
        'condition',
        'price',
      ]),
    });
    expect(body('/api/auth/login').properties.provider.enum).toContain(
      AuthProvider.CREDENTIALS,
    );
    expect(body('/api/products/{id}', 'patch').required ?? []).toEqual([]);
    expect(body('/api/products/{id}', 'patch').properties).not.toHaveProperty(
      'shopId',
    );
    expect(body('/api/user-addresses').properties.label).toBeDefined();
    expect(document.paths['/api/products'].get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'page', in: 'query' }),
      ]),
    );
    expect(document.paths['/api/categories/{id}'].get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'id',
          in: 'path',
          schema: expect.objectContaining({ format: 'uuid' }),
        }),
      ]),
    );
    const response = document.paths['/api/categories'].post?.responses[
      '201'
    ] as any;
    expect(
      response.content['application/json'].schema.properties.statusCode.enum,
    ).toEqual([201]);
    expect(
      response.content['application/json'].schema.properties.data.properties
        .createdAt,
    ).toMatchObject({ type: 'string', format: 'date-time' });
  });
});
