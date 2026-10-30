import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Client } from 'pg';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { createRequestValidationPipe } from '@/common/validation';
import { AdministrativeDivisionModule } from '@/modules/administrative-division';
import { AdministrativeDivisionService } from '@/modules/administrative-division/administrative-division.service';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { MarketplaceFactory } from '@/modules/database/seeds/factories/marketplace.factory';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { PickupLocationController } from '@/modules/shipping/pickup-location.controller';
import { PickupLocationService } from '@/modules/shipping/pickup-location.service';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole, ShopMemberStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';

const testUrl = process.env.PICKUP_TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
suite('Private pickup locations HTTP/PostgreSQL', () => {
  const schema = `pickup_test_${randomUUID().replaceAll('-', '')}`;
  let db: DataSource;
  let admin: Client;
  let app: INestApplication;
  let divisions: AdministrativeDivisionService;
  let seller: User;
  let owner: User;
  let staff: User;
  let stranger: User;
  let shop: Shop;
  let ownerMember: ShopMember;
  let counter = 0;
  const personal = '/api/shipping/pickup-location';
  const input = () => ({
    contactName: '  Pickup contact  ',
    phone: ' 0912345678 ',
    addressLine1: ' 45 Test Street ',
    provinceCode: '01',
    wardCode: divisions.findWardsByProvinceCode('01')[0].code,
  });
  const shopPath = () => `/api/shipping/shops/${shop.id}/pickup-location`;
  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.pathname !== '/rewear_pickup_test'
    )
      throw new Error('Use dedicated local rewear_pickup_test database');
    admin = new Client({ connectionString: testUrl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    db = await new DataSource({
      type: 'postgres',
      url: testUrl,
      schema,
      synchronize: true,
      entities: [path.join(__dirname, '../src/modules/**/*.entity.ts')],
    }).initialize();
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRootAsync({
          useFactory: () => db.options,
          dataSourceFactory: async () => db,
        }),
        AdministrativeDivisionModule,
      ],
      controllers: [PickupLocationController],
      providers: [
        PickupLocationService,
        { provide: APP_PIPE, useFactory: createRequestValidationPipe },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        async canActivate(ctx: ExecutionContext) {
          const req = ctx.switchToHttp().getRequest();
          const id = req.headers['x-test-user'];
          if (typeof id !== 'string') throw new UnauthorizedException();
          req.user = await db.manager.findOneBy(User, { id });
          if (!req.user) throw new UnauthorizedException();
          return true;
        },
      })
      .compile();
    divisions = module.get(AdministrativeDivisionService);
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });
  beforeEach(async () => {
    const factory = new MarketplaceFactory(`pickup-${counter++}`);
    [seller, owner, staff, stranger] = await db
      .getRepository(User)
      .save([0, 1, 2, 3].map((i) => factory.user(i, 'unused')));
    shop = await db.getRepository(Shop).save(factory.shop(0));
    [ownerMember] = await db.getRepository(ShopMember).save([
      factory.shopMember(0, shop.id, owner.id),
      factory.shopMember(1, shop.id, staff.id, {
        memberRole: ShopMemberRole.STAFF,
      }),
    ]);
  });
  afterAll(async () => {
    await app?.close();
    if (db?.isInitialized) await db.destroy();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });
  it('requires authentication on every pickup route', async () => {
    for (const route of [personal, shopPath()]) {
      await request(app.getHttpServer()).get(route).expect(401);
      await request(app.getHttpServer()).put(route).send(input()).expect(401);
    }
  });
  it('creates and replaces one personal location with canonical names and trimmed fields', async () => {
    const server = app.getHttpServer();
    const empty = await request(server)
      .get(personal)
      .set('x-test-user', seller.id)
      .expect(200);
    expect(empty.body.data.location).toBeNull();
    const saved = await request(server)
      .put(personal)
      .set('x-test-user', seller.id)
      .send(input())
      .expect(200);
    const location = saved.body.data.location;
    expect(location.contactName).toBe('Pickup contact');
    expect(location.addressLine1).toBe('45 Test Street');
    expect(location.phone).toBe('0912345678');
    expect(location.provinceName).toBe(
      divisions.resolveAddress('01', input().wardCode).provinceName,
    );
    expect(location).not.toHaveProperty('userId');
    const updated = await request(server)
      .put(personal)
      .set('x-test-user', seller.id)
      .send({ ...input(), contactName: 'Changed' })
      .expect(200);
    expect(updated.body.data.location.id).toBe(location.id);
    const read = await request(server)
      .get(personal)
      .set('x-test-user', seller.id)
      .expect(200);
    expect(read.body.data.location.contactName).toBe('Changed');
    expect(
      await db.manager.countBy(PickupLocation, { userId: seller.id }),
    ).toBe(1);
  });
  it('keeps personal and shop data separate and private', async () => {
    const server = app.getHttpServer();
    await request(server)
      .put(personal)
      .set('x-test-user', owner.id)
      .send(input())
      .expect(200);
    await request(server)
      .put(shopPath())
      .set('x-test-user', owner.id)
      .send({ ...input(), contactName: 'Shop contact' })
      .expect(200);
    const own = await request(server)
      .get(personal)
      .set('x-test-user', owner.id)
      .expect(200);
    expect(own.body.data.location.contactName).toBe('Pickup contact');
    const other = await request(server)
      .get(personal)
      .set('x-test-user', stranger.id)
      .expect(200);
    expect(other.body.data.location).toBeNull();
    const scoped = await request(server)
      .get(shopPath())
      .set('x-test-user', owner.id)
      .expect(200);
    expect(scoped.body.data.location.contactName).toBe('Shop contact');
    for (const user of [staff, stranger, seller]) {
      await request(server)
        .get(shopPath())
        .set('x-test-user', user.id)
        .expect(403);
      await request(server)
        .put(shopPath())
        .set('x-test-user', user.id)
        .send(input())
        .expect(403);
    }
  });
  it('denies a disabled owner membership and nonexistent shop', async () => {
    await db.manager.update(ShopMember, ownerMember.id, {
      status: ShopMemberStatus.INACTIVE,
    });
    await request(app.getHttpServer())
      .put(shopPath())
      .set('x-test-user', owner.id)
      .send(input())
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/shipping/shops/${randomUUID()}/pickup-location`)
      .set('x-test-user', owner.id)
      .expect(404);
  });
  it('rejects invalid fields, forged scope/names and province/ward mismatches without writing', async () => {
    const badWard = divisions.findWardsByProvinceCode('79')[0].code;
    for (const body of [
      { ...input(), contactName: '  ' },
      { ...input(), phone: 'invalid' },
      { ...input(), wardCode: badWard },
      { ...input(), userId: owner.id },
      { ...input(), shopId: shop.id },
      { ...input(), provinceName: 'Forged' },
      { ...input(), countryCode: 'US' },
      { ...input(), addressLine1: 'x'.repeat(256) },
    ]) {
      await request(app.getHttpServer())
        .put(personal)
        .set('x-test-user', seller.id)
        .send(body)
        .expect(400);
    }
    expect(
      await db.manager.countBy(PickupLocation, { userId: seller.id }),
    ).toBe(0);
  });
  it.each(['personal', 'shop'])(
    'serializes concurrent first saves for %s without duplicate or mixed rows',
    async (source) => {
      const route = source === 'personal' ? personal : shopPath();
      const userId = source === 'personal' ? seller.id : owner.id;
      const values = [
        { ...input(), contactName: 'One', addressLine1: 'One street' },
        { ...input(), contactName: 'Two', addressLine1: 'Two street' },
      ];
      const responses = await Promise.all(
        values.map((body) =>
          request(app.getHttpServer())
            .put(route)
            .set('x-test-user', userId)
            .send(body)
            .expect(200),
        ),
      );
      expect(responses[0].body.data.location.id).toBe(
        responses[1].body.data.location.id,
      );
      const rows = await db.manager.findBy(
        PickupLocation,
        source === 'personal' ? { userId } : { shopId: shop.id },
      );
      expect(rows).toHaveLength(1);
      expect(['One:One street', 'Two:Two street']).toContain(
        `${rows[0].contactName}:${rows[0].addressLine1}`,
      );
    },
  );
  it('enforces exclusive source and uniqueness at the database boundary', async () => {
    const saved = await request(app.getHttpServer())
      .put(personal)
      .set('x-test-user', seller.id)
      .send(input())
      .expect(200);
    const row = await db.manager.findOneByOrFail(PickupLocation, {
      id: saved.body.data.location.id,
    });
    for (const source of [
      { userId: null, shopId: null },
      { userId: seller.id, shopId: shop.id },
      { userId: seller.id, shopId: null },
    ]) {
      await expect(
        db.manager.save(PickupLocation, {
          ...row,
          id: randomUUID(),
          ...source,
        }),
      ).rejects.toThrow();
    }
  });
});
