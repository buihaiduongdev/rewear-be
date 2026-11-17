import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { CategoryFactory } from '@/database/factories/category.factory';
import { ProductFactory } from '@/database/factories/product.factory';
import { ShopMemberFactory } from '@/database/factories/shop-member.factory';
import { ShopFactory } from '@/database/factories/shop.factory';
import { UserFactory } from '@/database/factories/user.factory';
import { GhnSandboxAdapter } from '@/infrastructure/shipping/adapters/ghn-sandbox.adapter';
import { GhnShipmentClient } from '@/infrastructure/shipping/clients/ghn-shipment.client';
import { Category } from '@/modules/category/entities';
import { CheckoutOrder } from '@/modules/checkout/entities/checkout-order.entity';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { Order } from '@/modules/order/entities/order.entity';
import { OrderWorker } from '@/modules/order/order.worker';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { LateHandoverService } from '@/modules/shipment/late-handover.service';
import { ShipmentService } from '@/modules/shipment/shipment.service';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { createTestDatabase } from '../support/database';

describe('COD to carrier and cancellation HTTP flow', () => {
  let app: INestApplication;
  let db: DataSource;
  let buyer: User;
  let owner: User;
  let admin: User;
  let stranger: User;
  let shop: Shop;
  let checkout: Checkout;
  let token: (user: User) => string;
  const carrier = {
    prepare: async (
      _input: unknown,
      codAmount: number,
      clientCode: string,
    ) => ({
      cod_amount: codAmount,
      client_order_code: clientCode,
      payment_type_id: 1,
    }),
    create: async () => ({
      orderCode: 'E2EGHN',
      fee: 32000,
      estimatedDeliveryAt: null,
    }),
    query: async (clientCode: string) => ({
      clientCode,
      orderCode: 'E2EGHN',
      shopId: 123,
      status: 'cancel',
      updatedAt: new Date().toISOString(),
      codAmount: 230000,
      paymentType: 1,
      codCollected: false,
      codTransferred: false,
      collectedAt: null,
      transferredAt: null,
    }),
    cancel: async () => true,
    print: async () => ({
      url: 'https://dev-online-gateway.ghn.vn/a5/public-api/printA5?token=test',
    }),
  };

  beforeAll(async () => {
    const database = await createTestDatabase();
    await database.destroy();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OrderWorker)
      .useValue({})
      .overrideProvider(ShipmentWorker)
      .useValue({})
      .overrideProvider(GhnSandboxAdapter)
      .useValue({
        quote: async () => ({ fee: 30000, estimatedDeliveryAt: null }),
      })
      .overrideProvider(GhnShipmentClient)
      .useValue(carrier)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useLogger(false);
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    db = app.get(DataSource);
    token = (user) =>
      app
        .get(JwtService)
        .sign({ sub: user.id }, { secret: process.env.JWT_ACCESS_SECRET });

    [admin, buyer, owner, stranger] = await db.getRepository(User).save(
      [0, 1, 2, 3].map((i) =>
        new UserFactory().build({
          role: i === 0 ? UserRole.ADMIN : UserRole.USER,
          password: 'unused',
        }),
      ),
    );
    shop = await db.getRepository(Shop).save(new ShopFactory().build());
    await db
      .getRepository(ShopMember)
      .save(
        new ShopMemberFactory().build({ shopId: shop.id, userId: owner.id }),
      );
    const category = await db
      .getRepository(Category)
      .save(new CategoryFactory().build());
    const product = await db.getRepository(Product).save(
      new ProductFactory().build({
        shopId: shop.id,
        categoryId: category.id,
      }),
    );
    await db.getRepository(ProductModeration).save({
      productId: product.id,
      status: ProductModerationStatus.APPROVED,
    });
    const address = {
      recipientName: 'Buyer',
      phone: '0912345678',
      addressLine1: 'Test',
      addressLine2: null,
      countryCode: 'VN',
      provinceCode: '79',
      provinceName: 'HCM',
      wardCode: '1',
      wardName: 'Ward',
      postalCode: null,
      deliveryInstructions: null,
    };
    await db.getRepository(PickupLocation).save({
      shopId: shop.id,
      contactName: 'Shop',
      phone: address.phone,
      addressLine1: 'Pickup',
      countryCode: 'VN',
      provinceCode: '79',
      provinceName: 'HCM',
      wardCode: '1',
      wardName: 'Ward',
    });
    checkout = await db.getRepository(Checkout).save({
      buyerId: buyer.id,
      requestId: randomUUID(),
      addressId: randomUUID(),
      requestedProductIds: [product.id],
      address,
      status: 'HELD',
      expiresAt: new Date(Date.now() + 600000),
      removedItems: [],
    });
    await db.getRepository(Product).update(product.id, {
      status: ProductStatus.HELD,
      reservationId: checkout.id,
      heldUntil: checkout.expiresAt,
    });
    await db.getRepository(CheckoutOrder).save({
      checkoutId: checkout.id,
      shopId: shop.id,
      address,
      subtotal: 200000,
      shippingFee: null,
      items: [
        {
          productId: product.id,
          title: 'Jacket',
          price: 200000,
          size: null,
          condition: 'GOOD',
          coverUrl: null,
          shippingPackage: {
            weightGrams: 500,
            lengthCm: 30,
            widthCm: 20,
            heightCm: 5,
          },
        },
      ],
    });
  });
  afterAll(async () => app?.close());

  it('validates confirmed totals, isolates Shop permissions, exposes no carrier payload, and safely adjudicates cancellation', async () => {
    const server = app.getHttpServer();
    const codPath = `/api/checkouts/${checkout.id}/orders/cod`;
    await request(server)
      .post(codPath)
      .send({ expectedTotal: 230000 })
      .expect(401);
    await request(server)
      .post(codPath)
      .auth(token(buyer), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send({ expectedTotal: 1 })
      .expect(409);
    await request(server)
      .post(codPath)
      .auth(token(buyer), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send({ expectedTotal: 230000, cod_amount: 1 })
      .expect(400);
    const placed = await request(server)
      .post(codPath)
      .auth(token(buyer), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send({ expectedTotal: 230000 })
      .expect(200);
    const order = placed.body.data[0];
    expect(order.paymentMethod).toBe('COD');
    expect(order.paymentId).toBeNull();
    const shopOrder = `/api/shops/${shop.id}/orders/${order.id}`;
    await request(server)
      .post(`${shopOrder}/accept`)
      .auth(token(owner), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send({})
      .expect(200);
    await request(server)
      .post(`${shopOrder}/shipment`)
      .auth(token(stranger), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send({})
      .expect(403);
    const booked = await request(server)
      .post(`${shopOrder}/shipment`)
      .auth(token(owner), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send({})
      .expect(200);
    expect(booked.body.data.codAmount).toBe(230000);
    expect(booked.body.data.payload).toBeUndefined();
    expect(booked.body.data.input).toBeUndefined();
    await request(server)
      .post(`/api/orders/${order.id}/cod/cancellation-request`)
      .auth(token(buyer), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send({})
      .expect(200);
    await request(server)
      .post(`${shopOrder}/shipment/label`)
      .auth(token(owner), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send({})
      .expect(409);
    await request(server)
      .post(`${shopOrder}/cod/cancellation-response`)
      .auth(token(owner), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send({
        approve: false,
        reason: 'Other documented grounds',
        evidence: 'Supporting record',
      })
      .expect(200);
    await request(server)
      .post(`/api/orders/${order.id}/cod/cancellation-review`)
      .auth(token(buyer), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send({ reason: 'Please review seller grounds' })
      .expect(200);
    const decisionPath = `/api/admin/orders/${order.id}/cod/cancellation-decision`;
    const decision = {
      approve: true,
      reason: 'Cancellation justified',
      evidence: 'Case evidence',
    };
    await request(server)
      .post(decisionPath)
      .auth(token(owner), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send(decision)
      .expect(403);
    await request(server)
      .post(decisionPath)
      .auth(token(admin), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send(decision)
      .expect(200);
    await app.get(ShipmentService).reconcile(booked.body.data.id);
    const detail = await request(server)
      .get(`/api/orders/${order.id}`)
      .auth(token(buyer), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .expect(200);
    expect(detail.body.data.status).toBe('cancelled');
    expect(detail.body.data.walletRefund).toBeNull();
    expect(
      detail.body.data.events.find(
        (event: { action: string }) => event.action === 'CANCEL_REVIEW_DECIDED',
      ).actorId,
    ).toBe(admin.id);
    await request(server)
      .get('/api/admin/fulfillment/incidents')
      .auth(token(buyer), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .expect(403);
    await request(server)
      .get('/api/admin/fulfillment/incidents')
      .auth(token(admin), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .expect(200);
  });

  it('enforces admin and buyer access to late-handover consent and durable notices', async () => {
    const server = app.getHttpServer();
    const calendar = {
      year: new Date(Date.now() + 7 * 3600000).getUTCFullYear(),
      closedDates: [],
      source: 'Explicit test holiday calendar',
    };
    await request(server)
      .post('/api/admin/fulfillment/calendar')
      .auth(token(buyer), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send(calendar)
      .expect(403);
    await request(server)
      .post('/api/admin/fulfillment/calendar')
      .auth(token(admin), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send(calendar)
      .expect(200);
    const order = await db.getRepository(Order).save({
      checkoutOrderId: randomUUID(),
      buyerId: buyer.id,
      shopId: shop.id,
      shopName: shop.name,
      paymentMethod: 'COD',
      status: 'preparing',
      subtotal: 0,
      shippingFee: 0,
      total: 0,
      address: {},
      items: [],
      sellerConfirmBy: new Date(),
      acceptedAt: new Date(Date.now() - 49 * 3600000),
      handoverBy: new Date(Date.now() - 3600000),
    });
    await app.get(LateHandoverService).run();
    await request(server)
      .get('/api/admin/fulfillment/handovers')
      .auth(token(buyer), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .expect(403);
    await request(server)
      .get(`/api/orders/${order.id}/handover`)
      .auth(token(stranger), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .expect(404);
    const proposal = {
      deadline: new Date(Date.now() + 20 * 3600000).toISOString(),
      reason: 'Pickup rescheduled by carrier',
    };
    const proposalPath = `/api/admin/orders/${order.id}/handover/proposal`;
    await request(server)
      .post(proposalPath)
      .auth(token(owner), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send(proposal)
      .expect(403);
    await request(server)
      .post(proposalPath)
      .auth(token(admin), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send({ ...proposal, approve: true })
      .expect(400);
    const offered = await request(server)
      .post(proposalPath)
      .auth(token(admin), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send(proposal)
      .expect(200);
    expect(offered.body.data.state).toBe('OFFERED');
    const responsePath = `/api/orders/${order.id}/handover/response`;
    await request(server)
      .post(responsePath)
      .auth(token(stranger), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send({ accept: true })
      .expect(404);
    const consent = await request(server)
      .post(responsePath)
      .auth(token(buyer), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send({ accept: true })
      .expect(200);
    expect(consent.body.data.state).toBe('CONSENTED');
    expect(consent.body.data.proposedDeadline).toBe(
      offered.body.data.proposedDeadline,
    );
    const notices = await request(server)
      .get('/api/fulfillment/notices')
      .auth(token(buyer), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .expect(200);
    expect(
      notices.body.data.some(
        (notice: { orderId: string; action: string }) =>
          notice.orderId === order.id && notice.action === 'PROPOSED',
      ),
    ).toBe(true);
    const ownNotices = await request(server)
      .get('/api/fulfillment/notices')
      .auth(token(stranger), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .expect(200);
    expect(ownNotices.body.data).toEqual([]);
    await request(server)
      .get('/api/admin/fulfillment/carrier-incidents')
      .auth(token(owner), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .expect(403);
    await request(server)
      .get('/api/admin/fulfillment/carrier-incidents')
      .auth(token(admin), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .expect(200);
  });
});
