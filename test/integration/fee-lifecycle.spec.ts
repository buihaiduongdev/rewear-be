import { randomUUID } from 'node:crypto';

import { AuthProvider } from '@/modules/auth/enums';
import { FEE_KIND } from '@/modules/fees/constants/fee.constant';
import {
  FeePolicy,
  FeePolicyShopAcceptance,
} from '@/modules/fees/disclosure/fee-disclosure.entity';
import { FeeNotice } from '@/modules/fees/entities/fee.entity';
import {
  FeeAssessment,
  FeeCollection,
  FeeRefund,
} from '@/modules/fees/entities/fee.entity';
import {
  feeOutstanding,
  queueFeeCorrections,
  recordFeeCollection,
} from '@/modules/fees/fee-accounting';
import { FeeService } from '@/modules/fees/fee.service';
import { Order } from '@/modules/order/entities/order.entity';
import { FulfillmentCalendar } from '@/modules/shipment/entities/late-handover.entity';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { createTestDatabase, TestDatabase } from '../support/database';

describe('fee source corrections (PostgreSQL)', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => database?.destroy());
  async function fixture() {
    return database.dataSource.getRepository(FeeAssessment).save(
      database.dataSource.getRepository(FeeAssessment).create({
        orderId: randomUUID(),
        buyerId: randomUUID(),
        shopId: randomUUID(),
        party: 'BUYER',
        mode: 'SIMULATION',
        kind: 'CANCELLATION',
        sourceId: randomUUID(),
        waybillId: 'verified-waybill',
        invoiceReference: randomUUID(),
        invoiceLine: '1',
        amount: 5000,
        payableAmount: 5000,
        status: 'ACTIVE',
        reason: 'Verified buyer cancellation',
        evidence: 'Actual carrier invoice and fault evidence',
        disclosureVerifiedAt: new Date(),
        notifiedAt: new Date(),
        dueAt: new Date(Date.now() + 259200000),
        objectionUsed: false,
      }),
    );
  }
  it('reserves correction once, requires confirmed refunds, and keeps original source attribution', async () => {
    const fee = await fixture();
    await database.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const collection = await recordFeeCollection(
        manager,
        {
          feeId: fee.id,
          mode: 'SIMULATION',
          method: 'MOMO',
          sourceId: randomUUID(),
          amount: 5000,
        },
        new Date(),
      );
      await queueFeeCorrections(manager, fee, 2000, new Date());
      await queueFeeCorrections(manager, fee, 2000, new Date());
      const refunds = await manager.findBy(FeeRefund, { feeId: fee.id });
      expect(refunds).toHaveLength(1);
      expect(refunds[0]).toMatchObject({
        amount: 3000,
        sourceId: collection.sourceId,
        collectionId: collection.id,
        state: 'PENDING',
      });
      expect(await feeOutstanding(manager, fee.id)).toBe(0);
      refunds[0].state = 'SUCCEEDED';
      await manager.save(refunds[0]);
      expect(await feeOutstanding(manager, fee.id)).toBe(0);
      expect(await manager.countBy(FeeCollection, { feeId: fee.id })).toBe(1);
    });
  });
  it('freezes collection during objection and rejects pool mismatch and excessive collection', async () => {
    const fee = await fixture();
    await database.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const input = {
        feeId: fee.id,
        mode: 'SIMULATION' as const,
        method: 'MOMO' as const,
        sourceId: randomUUID(),
        amount: 5001,
      };
      await expect(
        recordFeeCollection(manager, input, new Date()),
      ).rejects.toThrow('not collectible');
      await expect(
        recordFeeCollection(
          manager,
          { ...input, mode: 'EVIDENCE', amount: 5000 },
          new Date(),
        ),
      ).rejects.toThrow('not collectible');
      Object.assign(fee, { status: 'REVIEW' });
      await manager.save(FeeAssessment, fee);
      await expect(
        recordFeeCollection(manager, { ...input, amount: 5000 }, new Date()),
      ).rejects.toThrow('not collectible');
    });
  });
  it('pauses a grounded objection, does not invent a calendar, and resets the full buyer window on upheld decision', async () => {
    const fee = await fixture();
    const db = database.dataSource;
    await db.getRepository(User).save({
      id: fee.buyerId,
      email: `${randomUUID()}@test.local`,
      fullName: 'Fee buyer',
      provider: AuthProvider.CREDENTIALS,
      status: UserStatus.ACTIVE,
    });
    const admin = await db.getRepository(User).save({
      email: `${randomUUID()}@test.local`,
      fullName: 'Fee reviewer',
      provider: AuthProvider.CREDENTIALS,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });
    const service = new FeeService(db);
    const proof = {
      reason: 'Invoice belongs to another shipment',
      evidence: 'Attached actual shipment reference and invoice',
    };
    const objection = await service.object(fee.buyerId, fee.id, proof);
    expect(objection.status).toBe('REVIEW');
    expect(objection.objectionUsed).toBe(true);
    expect(objection.reviewDueAt).toBeNull();
    await expect(service.object(fee.buyerId, fee.id, proof)).rejects.toThrow(
      'One timely',
    );
    const [{ now: before }] = await db.query('SELECT clock_timestamp() AS now');
    const upheld = await service.correct(admin.id, fee.id, {
      ...proof,
      payableAmount: fee.amount,
    });
    expect(upheld.status).toBe('ACTIVE');
    expect(upheld.dueAt!.getTime()).toBeGreaterThanOrEqual(
      new Date(before).getTime() + 72 * 60 * 60 * 1000,
    );
    expect(await db.getRepository(FeeNotice).countBy({ feeId: fee.id })).toBe(
      1,
    );
    await expect(service.get(randomUUID(), fee.id)).rejects.toThrow(
      'Active account',
    );
  });
  async function assessmentFixture(disclosed = true) {
    const db = database.dataSource;
    const buyer = await db.getRepository(User).save({
      email: randomUUID() + '@test.local',
      fullName: 'Buyer',
      provider: AuthProvider.CREDENTIALS,
      status: UserStatus.ACTIVE,
    });
    const owner = await db.getRepository(User).save({
      email: randomUUID() + '@test.local',
      fullName: 'Owner',
      provider: AuthProvider.CREDENTIALS,
      status: UserStatus.ACTIVE,
    });
    const admin = await db.getRepository(User).save({
      email: randomUUID() + '@test.local',
      fullName: 'Admin',
      provider: AuthProvider.CREDENTIALS,
      status: UserStatus.ACTIVE,
      role: UserRole.ADMIN,
    });
    const shop = await db.getRepository(Shop).save({ name: 'Fee test Shop' });
    await db.getRepository(ShopMember).save({
      shopId: shop.id,
      userId: owner.id,
      memberRole: ShopMemberRole.OWNER,
    });
    const at = new Date(Date.now() - 10000);
    const max = await db.getRepository(FeePolicy).maximum('version');
    const policy = await db.getRepository(FeePolicy).save({
      version: (max ?? 0) + 1,
      publishedAt: at,
      publishedBy: admin.id,
      conditions: Object.values(FEE_KIND).map((kind) => ({
        kind,
        text: 'Actual invoiced costs require verified responsibility proof.',
      })),
    });
    await db.getRepository(FeePolicyShopAcceptance).save({
      shopId: shop.id,
      policyId: policy.id,
      ownerId: owner.id,
      acceptedAt: at,
    });
    const order = await db.getRepository(Order).save(
      db.getRepository(Order).create({
        checkoutOrderId: randomUUID(),
        buyerId: buyer.id,
        shopId: shop.id,
        shopName: shop.name,
        status: 'cancelled',
        paymentMethod: 'COD',
        subtotal: 10000,
        shippingFee: 1000,
        total: 11000,
        sellerConfirmBy: new Date(),
        address: {} as Order['address'],
        items: [],
        carrierReturnedAt: new Date(),
        feeDisclosure: disclosed
          ? {
              policyId: policy.id,
              version: policy.version,
              publishedAt: at.toISOString(),
              buyerAcceptedAt: at.toISOString(),
              sellers: {
                [shop.id]: {
                  sellerAcceptedAt: at.toISOString(),
                  ownerId: owner.id,
                },
              },
            }
          : null,
      }),
    );
    const shipment = await db.getRepository(Shipment).save(
      db.getRepository(Shipment).create({
        orderId: order.id,
        state: 'CANCELLED',
        orderCode: randomUUID(),
        payload: {},
        input: {} as Shipment['input'],
        quotedParcel: {} as Shipment['quotedParcel'],
        codAmount: 10000,
        carrierFee: 4000,
        pickedObservedAt: new Date(),
      }),
    );
    return {
      db,
      buyer,
      owner,
      admin,
      shop,
      order,
      shipment,
      service: new FeeService(db),
    };
  }
  function assessmentInput(
    order: Order,
    shipment: Shipment,
    party: 'BUYER' | 'SHOP',
    kind: (typeof FEE_KIND)[keyof typeof FEE_KIND],
    amount = 5000,
  ) {
    return {
      orderId: order.id,
      sourceId: shipment.id,
      waybillId: shipment.orderCode!,
      party,
      kind,
      mode: 'SIMULATION' as const,
      invoiceReference: randomUUID(),
      invoiceLine: kind,
      amount,
      actualInvoiceAmount: 10000,
      reason: 'Verified actual carrier invoice and responsible party',
      evidence:
        'Invoice, measured parcel and independently verified event proof',
      ...(kind === 'SELLER_PACKAGE_ERROR'
        ? { actualInvoiceAmount: 10000, originallyQuotedAmount: 4000 }
        : {}),
    };
  }
  it.each(['BUYER', 'SHOP'] as const)(
    'requires prior consent and immutable actual invoice for %s cancellation',
    async (party) => {
      const f = await assessmentFixture();
      const input = assessmentInput(f.order, f.shipment, party, 'CANCELLATION');
      const assessed = await f.service.assess(f.admin.id, input);
      expect(assessed).toMatchObject({
        party,
        amount: 5000,
        payableAmount: 5000,
        status: 'ACTIVE',
      });
      expect(assessed.dueAt!.getTime() - assessed.notifiedAt!.getTime()).toBe(
        (party === 'BUYER' ? 72 : 168) * 3600000,
      );
      expect((await f.service.assess(f.admin.id, input)).id).toBe(assessed.id);
      await expect(
        f.service.assess(f.admin.id, { ...input, amount: 6000 }),
      ).rejects.toThrow('replay differs');
      const legacy = await assessmentFixture(false);
      await expect(
        legacy.service.assess(
          legacy.admin.id,
          assessmentInput(legacy.order, legacy.shipment, party, 'CANCELLATION'),
        ),
      ).rejects.toThrow('disclosure missing');
    },
  );
  it.each(['FAILED_DELIVERY', 'SELLER_PACKAGE_ERROR'] as const)(
    'records verified %s invoice without inferring fault from status',
    async (kind) => {
      const f = await assessmentFixture();
      const fee = await f.service.assess(
        f.admin.id,
        assessmentInput(f.order, f.shipment, 'SHOP', kind),
      );
      expect(fee.kind).toBe(kind);
      expect(
        await f.db.getRepository(FeeNotice).countBy({ feeId: fee.id }),
      ).toBeGreaterThan(0);
      await expect(
        f.service.assess(
          f.owner.id,
          assessmentInput(f.order, f.shipment, 'SHOP', kind),
        ),
      ).rejects.toThrow('Admin');
    },
  );
  it('absorbs tiny Buyer invoices but groups tiny Shop obligations without resetting dated lines', async () => {
    const f = await assessmentFixture();
    const absorbed = await f.service.assess(
      f.admin.id,
      assessmentInput(f.order, f.shipment, 'BUYER', 'CANCELLATION', 500),
    );
    expect(absorbed).toMatchObject({
      status: 'ABSORBED',
      payableAmount: 0,
      dueAt: null,
    });
    const tiny = await f.service.assess(
      f.admin.id,
      assessmentInput(f.order, f.shipment, 'SHOP', 'FAILED_DELIVERY', 500),
    );
    expect(tiny.dueAt).toBeNull();
    expect(tiny.notifiedAt).not.toBeNull();
    const next = await f.service.assess(f.admin.id, {
      ...assessmentInput(f.order, f.shipment, 'SHOP', 'FAILED_DELIVERY', 500),
      invoiceLine: 'return-leg',
    });
    const first = await f.db
      .getRepository(FeeAssessment)
      .findOneByOrFail({ id: tiny.id });
    expect(first.dueAt).toEqual(next.dueAt);
    expect(first.dueAt!.getTime() - first.notifiedAt!.getTime()).toBe(
      168 * 3600000,
    );
    await f.service.assess(f.admin.id, {
      ...assessmentInput(f.order, f.shipment, 'SHOP', 'FAILED_DELIVERY', 500),
      invoiceLine: 'extra-leg',
    });
    expect(
      (await f.db.getRepository(FeeAssessment).findOneByOrFail({ id: tiny.id }))
        .dueAt,
    ).toEqual(first.dueAt);
  });
  it('recovers missing calendar from the original objection timestamp and flags overdue review', async () => {
    const fee = await fixture();
    fee.status = 'REVIEW';
    fee.objectionAt = new Date('2026-11-20T01:00:00Z');
    fee.reviewDueAt = null;
    await database.dataSource.manager.save(FeeAssessment, fee);
    await database.dataSource.getRepository(FulfillmentCalendar).save({
      year: 2026,
      closedDates: [],
      source: 'Approved calendar',
      approvedBy: randomUUID(),
    });
    await new FeeService(database.dataSource).tick();
    const recovered = await database.dataSource
      .getRepository(FeeAssessment)
      .findOneByOrFail({ id: fee.id });
    expect(recovered.reviewDueAt!.toISOString()).toBe(
      '2026-11-24T10:00:00.000Z',
    );
  });
  it.each(['RETURN_SHIPPING', 'REFUSAL_EXTRA'] as const)(
    'does not allow public assessment to bypass verified %s return sources',
    async (kind) => {
      const f = await assessmentFixture();
      await expect(
        f.service.assess(
          f.admin.id,
          assessmentInput(f.order, f.shipment, 'SHOP', kind),
        ),
      ).rejects.toThrow('immutable verified return');
    },
  );
  it('rejects invented package quote baseline and invoice increase', async () => {
    const f = await assessmentFixture();
    const input = assessmentInput(
      f.order,
      f.shipment,
      'SHOP',
      'SELLER_PACKAGE_ERROR',
    );
    await expect(
      f.service.assess(f.admin.id, { ...input, originallyQuotedAmount: 0 }),
    ).rejects.toThrow('actual package invoice increase');
    await expect(
      f.service.assess(f.admin.id, { ...input, amount: 6001 }),
    ).rejects.toThrow('actual package invoice increase');
  });
  it.each(['CANCELLATION', 'FAILED_DELIVERY'] as const)(
    'caps %s fees at the verified invoice and rejects missing invoice amounts',
    async (kind) => {
      const f = await assessmentFixture();
      const input = assessmentInput(f.order, f.shipment, 'BUYER', kind);
      await expect(
        f.service.assess(f.admin.id, {
          ...input,
          amount: 1000000,
          actualInvoiceAmount: 20000,
        }),
      ).rejects.toThrow('actual invoice');
      await expect(
        f.service.assess(f.admin.id, {
          ...input,
          actualInvoiceAmount: undefined,
        }),
      ).rejects.toThrow('actual invoice');
    },
  );
  it('refunds cash sources before carrier netting and never repeats reserved corrections', async () => {
    const fee = await fixture();
    await database.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const carrier = await recordFeeCollection(
        manager,
        {
          feeId: fee.id,
          mode: 'SIMULATION',
          method: 'CARRIER_NETTING',
          sourceId: randomUUID(),
          amount: 2000,
        },
        new Date(),
      );
      const cash = await recordFeeCollection(
        manager,
        {
          feeId: fee.id,
          mode: 'SIMULATION',
          method: 'MOMO',
          sourceId: randomUUID(),
          amount: 3000,
        },
        new Date(),
      );
      const refunds = await queueFeeCorrections(manager, fee, 1000, new Date());
      expect(
        refunds.map((refund) => ({
          collectionId: refund.collectionId,
          amount: refund.amount,
        })),
      ).toEqual([
        { collectionId: cash.id, amount: 3000 },
        { collectionId: carrier.id, amount: 1000 },
      ]);
      expect(await queueFeeCorrections(manager, fee, 1000, new Date())).toEqual(
        [],
      );
    });
  });
  it('shows paid balance and pending source refund while excluding private references and evidence', async () => {
    const f = await assessmentFixture();
    const assessed = await f.service.assess(
      f.admin.id,
      assessmentInput(f.order, f.shipment, 'BUYER', 'CANCELLATION'),
    );
    await f.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      await recordFeeCollection(
        manager,
        {
          feeId: assessed.id,
          mode: 'SIMULATION',
          method: 'MOMO',
          sourceId: 'private-capture-reference',
          amount: 5000,
        },
        new Date(),
      );
    });
    const paid = await f.service.get(f.buyer.id, assessed.id);
    expect(paid.outstanding).toBe(0);
    expect(paid.collections).toHaveLength(1);
    const corrected = await f.service.correct(f.admin.id, assessed.id, {
      payableAmount: 2000,
      reason: 'Corrected actual carrier invoice amount',
      evidence: 'Private revised invoice and provider source proof',
    });
    expect(corrected).toMatchObject({
      outstanding: 0,
      reason: 'Corrected actual carrier invoice amount',
    });
    expect(corrected.refunds[0]).toMatchObject({
      amount: 3000,
      state: 'PENDING',
      method: 'MOMO',
    });
    expect(Object.keys(corrected.collections[0]).sort()).toEqual([
      'amount',
      'createdAt',
      'id',
      'method',
    ]);
    expect(Object.keys(corrected.refunds[0]).sort()).toEqual([
      'amount',
      'completedAt',
      'id',
      'method',
      'requestedAt',
      'state',
    ]);
    expect(JSON.stringify(corrected)).not.toContain(
      'private-capture-reference',
    );
    expect(JSON.stringify(corrected)).not.toContain('Private revised invoice');
    expect(corrected).not.toHaveProperty('invoiceReference');
  });
  it('permits one grounded objection to a tiny undated Shop fee and gives only active Admin an auditable queue', async () => {
    const f = await assessmentFixture();
    const tiny = await f.service.assess(
      f.admin.id,
      assessmentInput(f.order, f.shipment, 'SHOP', 'FAILED_DELIVERY', 500),
    );
    expect(tiny.dueAt).toBeNull();
    expect(tiny.notices).toHaveLength(1);
    expect(tiny.notices[0]).toMatchObject({
      amount: 500,
      dueAt: null,
      reason: 'Verified actual carrier invoice and responsible party',
    });
    expect(tiny.notices[0]).not.toHaveProperty('recipientId');
    await f.service.object(f.owner.id, tiny.id, {
      reason: 'Actual invoice includes an unrelated parcel',
      evidence: 'Carrier invoice with independent parcel proof',
    });
    await expect(
      f.service.object(f.owner.id, tiny.id, {
        reason: 'Another grounded invoice objection',
        evidence: 'Additional independently recorded carrier proof',
      }),
    ).rejects.toThrow('One timely');
    await expect(f.service.adminQueue(f.buyer.id, 0)).rejects.toThrow(
      'Active Admin',
    );
    const queue = await f.service.adminQueue(f.admin.id, 0);
    const audit = queue.find((row) => row.fee.id === tiny.id)!;
    expect(audit.fee).toMatchObject({
      status: 'REVIEW',
      evidence:
        'Invoice, measured parcel and independently verified event proof',
    });
    expect(audit.history.some((row) => row.action === 'OBJECTION')).toBe(true);
    expect(audit.notices[0].recipientId).toBe(f.owner.id);
    const firstActive = queue.findIndex((row) => row.fee.status !== 'REVIEW');
    expect(
      firstActive === -1 ||
        queue.slice(firstActive).every((row) => row.fee.status !== 'REVIEW'),
    ).toBe(true);
  });
});
