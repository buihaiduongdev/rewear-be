import { randomUUID } from 'node:crypto';

import ms from 'ms';

import { AuthProvider } from '@/modules/auth/enums';
import { CodReconciliationService } from '@/modules/cod-reconciliation/cod-reconciliation.service';
import { DisputeReviewService } from '@/modules/dispute/dispute-review.service';
import { DisputeService } from '@/modules/dispute/dispute.service';
import { DisputeCase } from '@/modules/dispute/entities/dispute-case.entity';
import { DisputeEvidence } from '@/modules/dispute/entities/dispute-evidence.entity';
import { DisputeIssue } from '@/modules/dispute/entities/dispute-issue.entity';
import { DisputeMessage } from '@/modules/dispute/entities/dispute-message.entity';
import { Order } from '@/modules/order/entities';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { OrderFundingService } from '@/modules/order/order-funding.service';
import { OrderSettlementService } from '@/modules/order/order-settlement.service';
import { OrderAccess } from '@/modules/order/order.access';
import { FulfillmentCalendar } from '@/modules/shipment/entities';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { businessDeadline } from '@/modules/shipment/utils/business-calendar';
import { ShopSettlement } from '@/modules/shop-finance/entities/shop-settlement.entity';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserStatus } from '@/modules/user/enums';

import { createTestDatabase, type TestDatabase } from '../support/database';
import { createPrivateMedia } from '../support/private-media';

describe('Dispute intake and holds (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: DisputeService;
  let review: DisputeReviewService;
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new DisputeService(database.dataSource, new OrderAccess());
    review = new DisputeReviewService(database.dataSource);
    await database.dataSource.getRepository(FulfillmentCalendar).save({
      year: 2026,
      closedDates: [],
      source: 'Explicit test calendar',
      approvedBy: randomUUID(),
    });
  });
  afterAll(async () => database?.destroy());
  async function fixture() {
    const db = database.dataSource;
    const buyer = await db.getRepository(User).save({
      email: `${randomUUID()}@test.local`,
      fullName: 'Buyer',
      provider: AuthProvider.CREDENTIALS,
      status: UserStatus.ACTIVE,
    });
    const owner = await db.getRepository(User).save({
      email: `${randomUUID()}@test.local`,
      fullName: 'Owner',
      provider: AuthProvider.CREDENTIALS,
      status: UserStatus.ACTIVE,
    });
    const shop = await db.getRepository(Shop).save({ name: 'Dispute shop' });
    await db.getRepository(ShopMember).save({
      shopId: shop.id,
      userId: owner.id,
      memberRole: ShopMemberRole.OWNER,
    });
    const productId = randomUUID();
    const secondProductId = randomUUID();
    const deliveredAt = new Date(Date.now() - ms('1h'));
    const deadline = new Date(deliveredAt.getTime() + ms('72h'));
    const items = [productId, secondProductId].map((id) => ({
      productId: id,
      title: 'Jacket',
      price: 100000,
      size: null,
      condition: 'GOOD' as const,
      coverUrl: null,
      shippingPackage: null,
    }));
    const order = await db.getRepository(Order).save({
      checkoutOrderId: randomUUID(),
      buyerId: buyer.id,
      shopId: shop.id,
      shopName: shop.name,
      paymentMethod: 'COD',
      status: 'completed',
      subtotal: 200000,
      shippingFee: 30000,
      total: 230000,
      commissionBasisPoints: 300,
      createdAt: new Date(Date.now() - ms('24h')),
      sellerConfirmBy: new Date(),
      deliveryObservedAt: deliveredAt,
      deliveryVerifiedAt: deliveredAt,
      disputeDeadlineAt: deadline,
      receiptConfirmedAt: new Date(),
      address: {},
      items,
    });
    await db.getRepository(OrderDeliveryVerification).save({
      orderId: order.id,
      deliveredAt,
      disputeDeadlineAt: deadline,
      mode: 'EVIDENCE',
      actorId: owner.id,
      reason: 'Checked time',
      evidence: 'Signed delivery receipt',
    });
    await db.getRepository(Shipment).save({
      orderId: order.id,
      state: 'BOOKED',
      orderCode: randomUUID(),
      payload: {},
      input: {} as Shipment['input'],
      quotedParcel: {} as Shipment['quotedParcel'],
      codAmount: order.total,
      providerStatus: 'delivered',
    });
    const input = {
      productId,
      kind: 'WRONG_ITEM' as const,
      description: 'Received another item than listing',
      evidenceIds: [] as string[],
    };
    return { db, buyer, owner, shop, order, productId, secondProductId, input };
  }
  async function evidence(
    f: Awaited<ReturnType<typeof fixture>>,
    tags = ['ISSUE'],
  ) {
    const media = await createPrivateMedia(f.db, f.buyer.id);
    return f.db.getRepository(DisputeEvidence).save({
      orderId: f.order.id,
      uploadedById: f.buyer.id,
      mediaId: media.id,
      media,
      tags,
    });
  }
  it('completed early still accepts buyer intake; duplicates keep the first supplement deadline and one case', async () => {
    const f = await fixture();
    const first = await service.openIssue(f.buyer.id, f.order.id, f.input);
    const second = await service.openIssue(f.buyer.id, f.order.id, f.input);
    expect(first.id).toBe(second.id);
    expect(first.supplementBy).toEqual(second.supplementBy);
    expect(first.status).toBe('NEEDS_EVIDENCE');
    expect(
      await f.db.getRepository(DisputeCase).countBy({ orderId: f.order.id }),
    ).toBe(1);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('dispute');
  });
  it('only the buyer can open, and the item must belong to the order', async () => {
    const f = await fixture();
    await expect(
      service.openIssue(f.owner.id, f.order.id, f.input),
    ).rejects.toThrow('Order');
    await expect(
      service.openIssue(f.buyer.id, f.order.id, {
        ...f.input,
        productId: randomUUID(),
      }),
    ).rejects.toThrow('Item does not belong');
  });
  it('rejects expired window and unverified deadline', async () => {
    const f = await fixture();
    await f.db
      .getRepository(Order)
      .update(f.order.id, { disputeDeadlineAt: new Date(Date.now() - 1) });
    await expect(
      service.openIssue(f.buyer.id, f.order.id, f.input),
    ).rejects.toThrow('window');
  });
  it('a photo is enough for wrong-item intake; no unbox video is required', async () => {
    const f = await fixture();
    const photo = await evidence(f);
    const issue = await service.openIssue(f.buyer.id, f.order.id, {
      ...f.input,
      evidenceIds: [photo.id],
    });
    expect(issue.status).toBe('ACTIVE');
    expect(issue.validAt).not.toBeNull();
    expect(issue.reviewDueAt).not.toBeNull();
    expect(issue.sellerRespondBy).not.toBeNull();
  });
  it('needs parcel, label and received-items evidence for missing items; description alone does not auto-validate', async () => {
    const f = await fixture();
    const first = await service.openIssue(f.buyer.id, f.order.id, {
      ...f.input,
      kind: 'MISSING_ITEM',
    });
    const photo = await evidence(f, ['PARCEL', 'LABEL', 'RECEIVED_ITEMS']);
    const updated = await service.supplement(f.buyer.id, first.id, {
      evidenceIds: [photo.id],
    });
    expect(updated.status).toBe('ACTIVE');
  });
  it('late supplementation closes only the incomplete issue and cannot reset its 24-hour window', async () => {
    const f = await fixture();
    const issue = await service.openIssue(f.buyer.id, f.order.id, f.input);
    await f.db
      .getRepository(DisputeIssue)
      .update(issue.id, { supplementBy: new Date(Date.now() - 1) });
    await review.refreshIssue(issue.id);
    const replay = await service.openIssue(f.buyer.id, f.order.id, f.input);
    expect(replay.id).toBe(issue.id);
    expect(replay.status).toBe('CLOSED_INCOMPLETE');
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('completed');
  });
  it('supplementing an existing issue after 72h still works within its original 24h allowance', async () => {
    const f = await fixture();
    const first = await service.openIssue(f.buyer.id, f.order.id, f.input);
    await f.db
      .getRepository(Order)
      .update(f.order.id, { disputeDeadlineAt: new Date(Date.now() - 1) });
    const photo = await evidence(f);
    expect(
      (
        await service.supplement(f.buyer.id, first.id, {
          evidenceIds: [photo.id],
        })
      ).status,
    ).toBe('ACTIVE');
    await expect(
      service.openIssue(f.buyer.id, f.order.id, {
        ...f.input,
        productId: f.secondProductId,
      }),
    ).rejects.toThrow('window');
  });
  it('later issues do not change the first valid SLA and a closed incomplete issue cannot free another issue hold', async () => {
    const f = await fixture();
    const photo = await evidence(f);
    const active = await service.openIssue(f.buyer.id, f.order.id, {
      ...f.input,
      evidenceIds: [photo.id],
    });
    const pending = await service.openIssue(f.buyer.id, f.order.id, {
      ...f.input,
      productId: f.secondProductId,
    });
    await f.db
      .getRepository(DisputeIssue)
      .update(pending.id, { supplementBy: new Date(Date.now() - 1) });
    await review.refreshIssue(pending.id);
    expect(
      (
        await f.db
          .getRepository(DisputeIssue)
          .findOneByOrFail({ id: active.id })
      ).reviewDueAt,
    ).toEqual(active.reviewDueAt);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('dispute');
  });
  it('cannot attach another order/uploader evidence', async () => {
    const f = await fixture();
    const other = await fixture();
    const photo = await evidence(other);
    await expect(
      service.openIssue(f.buyer.id, f.order.id, {
        ...f.input,
        evidenceIds: [photo.id],
      }),
    ).rejects.toThrow('Evidence');
    expect(
      await f.db.getRepository(DisputeCase).countBy({ orderId: f.order.id }),
    ).toBe(0);
  });
  it('seller may submit a late reply without resetting SLA and replay does not duplicate it', async () => {
    const f = await fixture();
    const photo = await evidence(f);
    const issue = await service.openIssue(f.buyer.id, f.order.id, {
      ...f.input,
      evidenceIds: [photo.id],
    });
    await f.db
      .getRepository(DisputeIssue)
      .update(issue.id, { sellerRespondBy: new Date(Date.now() - 1) });
    const input = {
      requestId: randomUUID(),
      text: 'Packing evidence will be provided',
      evidenceIds: [] as string[],
    };
    const reply = await service.reply(f.owner.id, issue.id, input);
    expect(reply.late).toBe(true);
    await service.reply(f.owner.id, issue.id, input);
    expect(
      await f.db.getRepository(DisputeMessage).countBy({ issueId: issue.id }),
    ).toBe(1);
    expect(
      (await f.db.getRepository(DisputeIssue).findOneByOrFail({ id: issue.id }))
        .reviewDueAt,
    ).toEqual(issue.reviewDueAt);
    await expect(
      service.reply(randomUUID(), issue.id, {
        ...input,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow('Shop order management access required');
  });
  it('keeps money held even if a later bug changes dispute order status back to completed', async () => {
    const f = await fixture();
    await service.openIssue(f.buyer.id, f.order.id, f.input);
    await f.db.getRepository(Order).update(f.order.id, { status: 'completed' });
    const funding = new OrderFundingService();
    const spy = jest.spyOn(funding, 'heldCredit');
    await new OrderSettlementService(f.db, funding).settleOrder(f.order.id);
    expect(spy).not.toHaveBeenCalled();
  });
  it('resolves calendar gaps from the original valid timestamp without restarting SLA', async () => {
    const f = await fixture();
    const photo = await evidence(f);
    await f.db.getRepository(FulfillmentCalendar).delete({ year: 2026 });
    let issue: DisputeIssue;
    try {
      issue = await service.openIssue(f.buyer.id, f.order.id, {
        ...f.input,
        evidenceIds: [photo.id],
      });
      expect(issue.calendarMissing).toBe(true);
    } finally {
      await f.db.getRepository(FulfillmentCalendar).save({
        year: 2026,
        closedDates: [],
        source: 'Explicit test calendar restored',
        approvedBy: randomUUID(),
      });
    }
    const updated = await review.refreshIssue(issue!.id);
    expect(updated.validAt).toEqual(issue!.validAt);
    expect(updated.reviewDueAt).toEqual(
      businessDeadline(issue!.validAt!, 3, []),
    );
    expect(updated.sellerRespondBy).toEqual(
      businessDeadline(issue!.sellerNotifiedAt!, 1, []),
    );
    expect(updated.calendarMissing).toBe(false);
  });
  it('one justified extension uses the original 5-day bound and does not reset seller response', async () => {
    const f = await fixture();
    const photo = await evidence(f);
    const issue = await service.openIssue(f.buyer.id, f.order.id, {
      ...f.input,
      evidenceIds: [photo.id],
    });
    const extended = await review.extend(randomUUID(), issue.id, {
      reason: 'Carrier evidence needs cross-checking',
    });
    expect(extended.reviewDueAt).toEqual(issue.maxReviewDueAt);
    expect(extended.sellerRespondBy).toEqual(issue.sellerRespondBy);
    const replay = await review.extend(randomUUID(), issue.id, {
      reason: 'Carrier evidence needs cross-checking',
    });
    expect(replay.extendedAt).toEqual(extended.extendedAt);
    await expect(
      review.extend(randomUUID(), issue.id, { reason: 'Another extension' }),
    ).rejects.toThrow('already extended');
  });
  it('overdue review escalates and keeps money held without choosing a winner', async () => {
    const f = await fixture();
    const photo = await evidence(f);
    const issue = await service.openIssue(f.buyer.id, f.order.id, {
      ...f.input,
      evidenceIds: [photo.id],
    });
    await f.db.getRepository(DisputeIssue).update(issue.id, {
      validAt: new Date(Date.now() - ms('14d')),
      reviewDueAt: new Date(Date.now() - ms('2d')),
      maxReviewDueAt: new Date(Date.now() - ms('1d')),
      sellerRespondBy: new Date(Date.now() - ms('3d')),
    });
    const updated = await review.refreshIssue(issue.id);
    expect(updated).toMatchObject({
      status: 'ACTIVE',
      reviewOverdue: true,
      sellerResponseOverdue: true,
    });
    expect(updated.escalatedAt).not.toBeNull();
    expect(updated.escalationDueAt).not.toBeNull();
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('dispute');
  });
  it('simultaneous duplicate intake creates one issue and one case', async () => {
    const f = await fixture();
    const results = await Promise.all([
      service.openIssue(f.buyer.id, f.order.id, f.input),
      service.openIssue(f.buyer.id, f.order.id, f.input),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(
      await f.db
        .getRepository(DisputeIssue)
        .countBy({ caseId: results[0].caseId }),
    ).toBe(1);
  });
  it('late reply before the first worker scan still records missed seller response deadline', async () => {
    const f = await fixture();
    const photo = await evidence(f);
    const issue = await service.openIssue(f.buyer.id, f.order.id, {
      ...f.input,
      evidenceIds: [photo.id],
    });
    await f.db
      .getRepository(DisputeIssue)
      .update(issue.id, { sellerRespondBy: new Date(Date.now() - ms('1h')) });
    await service.reply(f.owner.id, issue.id, {
      requestId: randomUUID(),
      text: 'Late response',
      evidenceIds: [],
    });
    expect((await review.refreshIssue(issue.id)).sellerResponseOverdue).toBe(
      true,
    );
  });
  it('calendar recovery classifies previously unknown replies from original message timestamps', async () => {
    const f = await fixture();
    const photo = await evidence(f);
    const issue = await service.openIssue(f.buyer.id, f.order.id, {
      ...f.input,
      evidenceIds: [photo.id],
    });
    const validAt = new Date(Date.now() - ms('7d'));
    await f.db.getRepository(DisputeIssue).update(issue.id, {
      validAt,
      sellerNotifiedAt: validAt,
      sellerRespondBy: null,
      reviewDueAt: null,
      maxReviewDueAt: null,
      calendarMissing: true,
    });
    await f.db.getRepository(FulfillmentCalendar).delete({ year: 2026 });
    let reply: DisputeMessage;
    try {
      reply = await service.reply(f.owner.id, issue.id, {
        requestId: randomUUID(),
        text: 'Response while calendar missing',
        evidenceIds: [],
      });
    } finally {
      await f.db.getRepository(FulfillmentCalendar).save({
        year: 2026,
        closedDates: [],
        source: 'Restored approved test calendar',
        approvedBy: randomUUID(),
      });
    }
    expect(reply!.late).toBeNull();
    await review.refreshIssue(issue.id);
    expect(
      (
        await f.db
          .getRepository(DisputeMessage)
          .findOneByOrFail({ id: reply!.id })
      ).late,
    ).toBe(true);
  });
  it('rolls back case, issue and order hold together when audit persistence fails', async () => {
    const f = await fixture();
    await f.db.query(
      'ALTER TABLE dispute_audits ADD CONSTRAINT test_reject_dispute CHECK (false) NOT VALID',
    );
    try {
      await expect(
        service.openIssue(f.buyer.id, f.order.id, f.input),
      ).rejects.toThrow('test_reject_dispute');
    } finally {
      await f.db.query(
        'ALTER TABLE dispute_audits DROP CONSTRAINT test_reject_dispute',
      );
    }
    expect(
      await f.db.getRepository(DisputeCase).countBy({ orderId: f.order.id }),
    ).toBe(0);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('completed');
  });
  it('rechecks the DB clock after lock wait; expired intake cannot race a funded release', async () => {
    const f = await fixture();
    const shipment = await f.db
      .getRepository(Shipment)
      .findOneByOrFail({ orderId: f.order.id });
    const reconciliation = new CodReconciliationService(f.db);
    await reconciliation.recordCollection(randomUUID(), f.order.id, {
      requestId: randomUUID(),
      mode: 'EVIDENCE',
      waybillCode: shipment.orderCode!,
      collectedAmount: f.order.total,
      approvedCarrierFee: 0,
      collectedAt: new Date().toISOString(),
      reason: 'Verified collection',
      evidence: 'Carrier statement matched',
    });
    await reconciliation.recordRemittance(randomUUID(), {
      requestId: randomUUID(),
      reference: randomUUID(),
      mode: 'EVIDENCE',
      netAmount: f.order.total,
      receivedAt: new Date().toISOString(),
      reason: 'Verified remittance',
      evidence: 'Bank statement matched',
      allocations: [
        { orderId: f.order.id, cashAmount: f.order.total, feeDeducted: 0 },
      ],
    });
    const deadline = new Date(Date.now() + ms('2s'));
    const deliveredAt = new Date(deadline.getTime() - ms('72h'));
    await f.db.getRepository(Order).update(f.order.id, {
      deliveryVerifiedAt: deliveredAt,
      disputeDeadlineAt: deadline,
    });
    await f.db
      .getRepository(OrderDeliveryVerification)
      .update(
        { orderId: f.order.id },
        { deliveredAt, disputeDeadlineAt: deadline, mode: 'EVIDENCE' },
      );
    let pending: Promise<{ error?: Error }>;
    await f.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      pending = service.openIssue(f.buyer.id, f.order.id, f.input).then(
        () => ({}),
        (error) => ({ error }),
      );
      await manager.query('SELECT pg_sleep(2.2)');
    });
    expect((await pending!).error?.message).toContain('window');
    expect(
      await f.db.getRepository(DisputeCase).countBy({ orderId: f.order.id }),
    ).toBe(0);
    await new OrderSettlementService(
      f.db,
      new OrderFundingService(),
    ).settleOrder(f.order.id);
    expect(
      await f.db.getRepository(ShopSettlement).countBy({ orderId: f.order.id }),
    ).toBe(1);
  });
});
