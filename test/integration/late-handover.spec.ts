import { randomUUID } from 'node:crypto';

import { ShopMemberFactory } from '@/database/factories/shop-member.factory';
import { ShopFactory } from '@/database/factories/shop.factory';
import { UserFactory } from '@/database/factories/user.factory';
import { CodPolicy } from '@/modules/cod/policies/cod.policy';
import { Order } from '@/modules/order/entities';
import { OrderService } from '@/modules/order/order.service';
import { FulfillmentCalendar, HandoverCase } from '@/modules/shipment/entities';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { LateHandoverService } from '@/modules/shipment/late-handover.service';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';
import { WalletService } from '@/modules/wallet/wallet.service';

import { createTestDatabase, TestDatabase } from '../support/database';

describe('Late handover consent (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: LateHandoverService;
  beforeAll(async () => {
    database = await createTestDatabase();
    const db = database.dataSource;

    service = new LateHandoverService(
      db,
      new OrderService(db, new WalletService(db), new CodPolicy(db)),
    );
    for (const year of [2026, 2027, 2028])
      await db.getRepository(FulfillmentCalendar).save({
        year,
        closedDates: [],
        source: 'Test approved calendar',
        approvedBy: randomUUID(),
      });
  });
  afterAll(async () => database?.destroy());
  async function fixture() {
    const db = database.dataSource;

    const [buyer, owner] = await db.getRepository(User).save([
      new UserFactory().build({
        role: UserRole.ADMIN,
        password: 'unused',
      }),
      new UserFactory().build({
        role: UserRole.USER,
        password: 'unused',
      }),
    ]);
    const shop = await db.getRepository(Shop).save(new ShopFactory().build());
    await db
      .getRepository(ShopMember)
      .save(
        new ShopMemberFactory().build({ shopId: shop.id, userId: owner.id }),
      );
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
    await service.run();
    return { db, buyer, owner, shop, order };
  }
  it('detects once, blocks handover, persists original SLA and exact buyer proposal', async () => {
    const f = await fixture();
    const initial = await service.buyerView(f.buyer.id, f.order.id);
    expect(initial.state).toBe('REVIEW');
    expect(initial.reviewDueAt).toBeInstanceOf(Date);
    expect(
      (await service.notices(f.buyer.id)).some(
        (notice) =>
          notice.orderId === f.order.id && notice.action === 'OVERDUE',
      ),
    ).toBe(true);
    expect(
      (await service.notices(f.owner.id)).some(
        (notice) =>
          notice.orderId === f.order.id && notice.action === 'OVERDUE',
      ),
    ).toBe(true);
    expect(await service.notices(randomUUID())).toEqual([]);
    await service.run();
    expect(
      (await service.buyerView(f.buyer.id, f.order.id)).detectedAt,
    ).toEqual(initial.detectedAt);
    await expect(
      service.propose(randomUUID(), f.order.id, {
        deadline: new Date(Date.now() + 3600000).toISOString(),
        reason: 'Insufficient buyer response window',
      }),
    ).rejects.toThrow(/single valid extension|Could not find/);
    await expect(
      service.propose(randomUUID(), f.order.id, {
        deadline: new Date(Date.now() + 25 * 3600000).toISOString(),
        reason: 'Carrier delay',
      }),
    ).rejects.toThrow(/single valid extension|Could not find/);
    const offered = await service.propose(randomUUID(), f.order.id, {
      deadline: new Date(Date.now() + 20 * 3600000).toISOString(),
      reason: 'Carrier delay',
    });
    expect(offered.state).toBe('OFFERED');
    expect(offered.respondBy).toBeInstanceOf(Date);
    await expect(
      service.respond(randomUUID(), f.order.id, { accept: true }),
    ).rejects.toThrow(/single valid extension|Could not find/);
    const accepted = await service.respond(f.buyer.id, f.order.id, {
      accept: true,
    });
    expect(accepted.state).toBe('CONSENTED');
    const order = await f.db
      .getRepository(Order)
      .findOneByOrFail({ id: f.order.id });
    expect(order.handoverBy).toEqual(offered.proposedDeadline);
    expect(order.handoverReviewRequired).toBe(false);
    await expect(
      service.propose(randomUUID(), f.order.id, {
        deadline: new Date(Date.now() + 21 * 3600000).toISOString(),
        reason: 'Another delay',
      }),
    ).rejects.toThrow(/single valid extension|Could not find/);
  });
  it('no response cancels without buyer restriction or invented carrier status', async () => {
    const f = await fixture();
    await service.propose(randomUUID(), f.order.id, {
      deadline: new Date(Date.now() + 20 * 3600000).toISOString(),
      reason: 'Delay',
    });
    await f.db
      .getRepository(HandoverCase)
      .update({ orderId: f.order.id }, { respondBy: new Date(0) });
    await service.run();
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('cancelled');
    expect((await service.buyerView(f.buyer.id, f.order.id)).state).toBe(
      'CLOSED',
    );
  });
  it('refusal after observed pickup requests return and retains the physical order', async () => {
    const f = await fixture();
    await service.propose(randomUUID(), f.order.id, {
      deadline: new Date(Date.now() + 20 * 3600000).toISOString(),
      reason: 'Delay',
    });
    await f.db.getRepository(Shipment).save({
      orderId: f.order.id,
      state: 'BOOKED',
      payload: {},
      input: {},
      quotedParcel: {},
      codAmount: 0,
      pickedObservedAt: new Date(),
      orderCode: randomUUID(),
    });
    await f.db.getRepository(Order).update(f.order.id, { status: 'shipping' });
    const result = await service.respond(f.buyer.id, f.order.id, {
      accept: false,
    });
    expect(result.state).toBe('RETURN_PENDING');
    const shipment = await f.db
      .getRepository(Shipment)
      .findOneByOrFail({ orderId: f.order.id });
    expect(shipment.returnRequestedAt).toBeInstanceOf(Date);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('shipping');
  });

  it('expires the single extension and never grants another extension', async () => {
    const f = await fixture();
    await service.propose(randomUUID(), f.order.id, {
      deadline: new Date(Date.now() + 20 * 3600000).toISOString(),
      reason: 'Delay',
    });
    await service.respond(f.buyer.id, f.order.id, { accept: true });
    await f.db
      .getRepository(Order)
      .update(f.order.id, { handoverBy: new Date(0) });
    await service.run();
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('cancelled');
    await expect(
      service.propose(randomUUID(), f.order.id, {
        deadline: new Date(Date.now() + 20 * 3600000).toISOString(),
        reason: 'Another delay',
      }),
    ).rejects.toThrow(/single valid extension|Could not find/);
  });

  it('late buyer acceptance persists timeout cancellation instead of reviving the order', async () => {
    const f = await fixture();
    await service.propose(randomUUID(), f.order.id, {
      deadline: new Date(Date.now() + 20 * 3600000).toISOString(),
      reason: 'Delay',
    });
    await f.db
      .getRepository(HandoverCase)
      .update({ orderId: f.order.id }, { respondBy: new Date(0) });
    const result = await service.respond(f.buyer.id, f.order.id, {
      accept: true,
    });
    expect(result.state).toBe('CLOSED');
    expect(result.consentedAt).toBeNull();
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('cancelled');
  });

  it('admin SLA expiration requests carrier cancellation without releasing an unverified waybill', async () => {
    const f = await fixture();
    await f.db.getRepository(Shipment).save({
      orderId: f.order.id,
      state: 'UNKNOWN',
      payload: {},
      input: {},
      quotedParcel: {},
      codAmount: 0,
    });
    await f.db
      .getRepository(HandoverCase)
      .update({ orderId: f.order.id }, { reviewDueAt: new Date(0) });
    await service.run();
    expect((await service.buyerView(f.buyer.id, f.order.id)).state).toBe(
      'CANCEL_PENDING',
    );
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('preparing');
  });

  it('keeps pickup while a proposal is pending visible for buyer choice', async () => {
    const f = await fixture();
    await service.propose(randomUUID(), f.order.id, {
      deadline: new Date(Date.now() + 20 * 3600000).toISOString(),
      reason: 'Delay',
    });
    await f.db.getRepository(Shipment).save({
      orderId: f.order.id,
      state: 'BOOKED',
      payload: {},
      input: {},
      quotedParcel: {},
      codAmount: 0,
      pickedObservedAt: new Date(),
    });
    await f.db.getRepository(Order).update(f.order.id, { status: 'shipping' });
    await service.run();
    expect((await service.buyerView(f.buyer.id, f.order.id)).state).toBe(
      'OFFERED',
    );
    expect(
      (await service.respond(f.buyer.id, f.order.id, { accept: true })).state,
    ).toBe('CONSENTED');
    await service.run();
    expect((await service.buyerView(f.buyer.id, f.order.id)).state).toBe(
      'CLOSED',
    );
  });

  it('does not invent a business deadline when approved holiday coverage is missing', async () => {
    const f = await fixture();
    const year = new Date(Date.now() + 7 * 3600000).getUTCFullYear();
    await f.db.getRepository(FulfillmentCalendar).delete({ year });
    await f.db
      .getRepository(HandoverCase)
      .update(
        { orderId: f.order.id },
        { reviewDueAt: null, calendarMissing: true },
      );
    await service.run();
    const row = await service.buyerView(f.buyer.id, f.order.id);
    expect(row.calendarMissing).toBe(true);
    expect(row.reviewDueAt).toBeNull();
    await expect(
      service.propose(randomUUID(), f.order.id, {
        deadline: new Date(Date.now() + 20 * 3600000).toISOString(),
        reason: 'Delay',
      }),
    ).rejects.toThrow(/single valid extension|Could not find/);
    await service.configureCalendar(randomUUID(), {
      year,
      closedDates: [],
      source: 'Test coverage restored',
    });
    await service.run();
    const restored = await service.buyerView(f.buyer.id, f.order.id);
    expect(restored.calendarMissing).toBe(false);
    expect(restored.detectedAt).toEqual(row.detectedAt);
    expect(restored.reviewDueAt).toBeInstanceOf(Date);
  });
  it('does not treat pickup observed after the consent deadline as an on-time completed extension', async () => {
    const f = await fixture();
    await service.propose(randomUUID(), f.order.id, {
      deadline: new Date(Date.now() + 20 * 3600000).toISOString(),
      reason: 'Delay',
    });
    await service.respond(f.buyer.id, f.order.id, { accept: true });
    await f.db.getRepository(Order).update(f.order.id, {
      handoverBy: new Date(Date.now() - 3600000),
      status: 'shipping',
    });
    await f.db.getRepository(Shipment).save({
      orderId: f.order.id,
      state: 'BOOKED',
      payload: {},
      input: {},
      quotedParcel: {},
      codAmount: 0,
      pickedObservedAt: new Date(),
    });
    await service.run();
    expect((await service.buyerView(f.buyer.id, f.order.id)).state).toBe(
      'RETURN_PENDING',
    );
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('shipping');
  });
  it('continues processing later deadlines behind more than 100 unresolved cases', async () => {
    const f = await fixture();
    const orders = await f.db.getRepository(Order).save(
      Array.from({ length: 101 }, () => ({
        checkoutOrderId: randomUUID(),
        buyerId: f.buyer.id,
        shopId: f.shop.id,
        shopName: f.shop.name,
        paymentMethod: 'COD' as const,
        status: 'preparing' as const,
        subtotal: 0,
        shippingFee: 0,
        total: 0,
        address: {},
        items: [],
        sellerConfirmBy: new Date(),
        acceptedAt: new Date(),
        handoverBy: new Date(0),
      })),
    );
    await f.db.getRepository(HandoverCase).save(
      orders.map((order) => ({
        orderId: order.id,
        state: 'CANCEL_PENDING' as const,
        detectedAt: new Date(0),
        updatedAt: new Date(0),
        reviewDueAt: null,
        events: [],
      })),
    );
    await f.db
      .getRepository(HandoverCase)
      .update({ orderId: f.order.id }, { reviewDueAt: new Date(0) });
    for (let pass = 0; pass < 3; pass++) await service.run();
    expect((await service.buyerView(f.buyer.id, f.order.id)).state).toBe(
      'CLOSED',
    );
  });
  it('admin can safely stop a late order with an audited reason even without calendar configuration', async () => {
    const f = await fixture();
    const adminId = randomUUID();
    const result = await service.adminStop(adminId, f.order.id, {
      reason: 'Cannot arrange pickup',
      evidence: 'Carrier confirmation ticket',
    });
    expect(result.state).toBe('CLOSED');
    expect(
      result.events.some(
        (event) =>
          event.action === 'ADMIN_STOPPED' &&
          event.actorId === adminId &&
          event.evidence === 'Carrier confirmation ticket',
      ),
    ).toBe(true);
  });
});
