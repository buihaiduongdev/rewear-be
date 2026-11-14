import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { GhnSandboxAdapter } from '@/infrastructure/shipping/ghn-sandbox.adapter';
import { GhnShipmentClient } from '@/infrastructure/shipping/ghn-shipment.client';
import { Category } from '@/modules/category/entities';
import { CheckoutOrder } from '@/modules/checkout/entities/checkout-order.entity';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { MarketplaceFactory } from '@/modules/database/seeds/factories/marketplace.factory';
import { OrderWorker } from '@/modules/order/order.worker';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { ShipmentService } from '@/modules/shipment/shipment.service';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';

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
    const factory = new MarketplaceFactory(randomUUID());
    [admin, buyer, owner, stranger] = await db
      .getRepository(User)
      .save([0, 1, 2, 3].map((i) => factory.user(i, 'unused')));
    shop = await db.getRepository(Shop).save(factory.shop(0));
    await db
      .getRepository(ShopMember)
      .save(factory.shopMember(0, shop.id, owner.id));
    const category = await db.getRepository(Category).save(factory.category(0));
    const product = await db
      .getRepository(Product)
      .save(factory.product(0, { shopId: shop.id, categoryId: category.id }));
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
          revision: 1,
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
      .send({ expectedTotal: 1 })
      .expect(409);
    await request(server)
      .post(codPath)
      .auth(token(buyer), { type: 'bearer' })
      .send({ expectedTotal: 230000, cod_amount: 1 })
      .expect(400);
    const placed = await request(server)
      .post(codPath)
      .auth(token(buyer), { type: 'bearer' })
      .send({ expectedTotal: 230000 })
      .expect(200);
    const order = placed.body.data[0];
    expect(order.paymentMethod).toBe('COD');
    expect(order.paymentId).toBeNull();
    const shopOrder = `/api/shops/${shop.id}/orders/${order.id}`;
    await request(server)
      .post(`${shopOrder}/accept`)
      .auth(token(owner), { type: 'bearer' })
      .send({})
      .expect(200);
    await request(server)
      .post(`${shopOrder}/shipment`)
      .auth(token(stranger), { type: 'bearer' })
      .send({})
      .expect(403);
    const booked = await request(server)
      .post(`${shopOrder}/shipment`)
      .auth(token(owner), { type: 'bearer' })
      .send({})
      .expect(200);
    expect(booked.body.data.codAmount).toBe(230000);
    expect(booked.body.data.payload).toBeUndefined();
    expect(booked.body.data.input).toBeUndefined();
    await request(server)
      .post(`/api/orders/${order.id}/cod/cancellation-request`)
      .auth(token(buyer), { type: 'bearer' })
      .send({})
      .expect(200);
    await request(server)
      .post(`${shopOrder}/shipment/label`)
      .auth(token(owner), { type: 'bearer' })
      .send({})
      .expect(409);
    await request(server)
      .post(`${shopOrder}/cod/cancellation-response`)
      .auth(token(owner), { type: 'bearer' })
      .send({
        approve: false,
        reason: 'Other documented grounds',
        evidence: 'Supporting record',
      })
      .expect(200);
    await request(server)
      .post(`/api/orders/${order.id}/cod/cancellation-review`)
      .auth(token(buyer), { type: 'bearer' })
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
      .send(decision)
      .expect(403);
    await request(server)
      .post(decisionPath)
      .auth(token(admin), { type: 'bearer' })
      .send(decision)
      .expect(200);
    await app.get(ShipmentService).reconcile(booked.body.data.id);
    const detail = await request(server)
      .get(`/api/orders/${order.id}`)
      .auth(token(buyer), { type: 'bearer' })
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
      .expect(403);
    await request(server)
      .get('/api/admin/fulfillment/incidents')
      .auth(token(admin), { type: 'bearer' })
      .expect(200);
  });
});
