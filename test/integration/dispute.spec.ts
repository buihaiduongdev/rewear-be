import { randomUUID } from 'node:crypto';

import ms from 'ms';

import { StorageService } from '@/infrastructure/storage';
import { AuthProvider } from '@/modules/auth/enums';
import { DisputeService } from '@/modules/dispute/dispute.service';
import { DisputeCase } from '@/modules/dispute/entities/dispute-case.entity';
import { DisputeEvidence } from '@/modules/dispute/entities/dispute-evidence.entity';
import { DisputeIssue } from '@/modules/dispute/entities/dispute-issue.entity';
import { DisputeMessage } from '@/modules/dispute/entities/dispute-message.entity';
import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { OutboxEvent } from '@/modules/event/entities/outbox-event.entity';
import { OutboxService } from '@/modules/event/outbox.service';
import { MediaService } from '@/modules/media/media.service';
import { Order } from '@/modules/order/entities';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { OrderFundingService } from '@/modules/order/order-funding.service';
import { OrderSettlementService } from '@/modules/order/order-settlement.service';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserStatus } from '@/modules/user/enums';

import { createTestDatabase, type TestDatabase } from '../support/database';
import { createPrivateMedia } from '../support/private-media';

describe('Dispute 72h intake, evidence, and holds (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: DisputeService;

  beforeAll(async () => {
    database = await createTestDatabase();
    service = new DisputeService(
      database.dataSource,
      {} as StorageService,
      {} as MediaService,
      new OutboxService(),
    );
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
    const deliveredAt = new Date(Date.now() - ms('1h'));
    const deadline = new Date(deliveredAt.getTime() + ms('72h'));
    const order = await db.getRepository(Order).save({
      checkoutOrderId: randomUUID(),
      buyerId: buyer.id,
      shopId: shop.id,
      shopName: shop.name,
      paymentMethod: 'COD',
      status: 'completed',
      subtotal: 100000,
      shippingFee: 30000,
      total: 130000,
      commissionBasisPoints: 300,
      createdAt: new Date(Date.now() - ms('24h')),
      sellerConfirmBy: new Date(),
      deliveryObservedAt: deliveredAt,
      deliveryVerifiedAt: deliveredAt,
      disputeDeadlineAt: deadline,
      receiptConfirmedAt: new Date(),
      address: {},
      items: [
        {
          productId,
          title: 'Jacket',
          price: 100000,
          size: null,
          condition: 'GOOD',
          coverUrl: null,
          shippingPackage: null,
        },
      ],
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
    return { db, buyer, owner, shop, order, productId };
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

  it('opens an active issue within 72h with photo or unbox evidence, holds order, and deduplicates retries', async () => {
    const f = await fixture();
    const photo = await evidence(f, ['UNBOX']);
    const input = {
      productId: f.productId,
      kind: 'WRONG_ITEM' as const,
      description: 'Received another item than listing',
      evidenceIds: [photo.id],
    };
    const [first, second] = await Promise.all([
      service.openIssue(f.buyer.id, f.order.id, input),
      service.openIssue(f.buyer.id, f.order.id, {
        ...input,
        kind: 'NOT_AS_DESCRIBED',
      }),
    ]);
    expect(first.id).toBe(second.id);
    expect(first.status).toBe('ACTIVE');
    expect(first.reviewDueAt).toBeInstanceOf(Date);
    expect(
      await f.db.getRepository(DisputeCase).countBy({ orderId: f.order.id }),
    ).toBe(1);
    expect(
      await f.db.getRepository(OutboxEvent).countBy({
        eventType: EVENT_TYPES.DISPUTE_UPDATED,
        resourceId: first.caseId,
      }),
    ).toBe(1);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('dispute');
  });

  it('rejects expired 72h window, non-buyer intake, and insufficient evidence tags', async () => {
    const f = await fixture();
    const wrongTag = await evidence(f, ['LABEL']);
    await expect(
      service.openIssue(f.buyer.id, f.order.id, {
        productId: f.productId,
        kind: 'MISSING_ITEM',
        description: 'Missing item without unbox/parcel proof',
        evidenceIds: [wrongTag.id],
      }),
    ).rejects.toThrow('evidence');

    await f.db
      .getRepository(Order)
      .update(f.order.id, { disputeDeadlineAt: new Date(Date.now() - 1) });
    const valid = await evidence(f, ['UNBOX']);
    await expect(
      service.openIssue(f.buyer.id, f.order.id, {
        productId: f.productId,
        kind: 'MISSING_ITEM',
        description: 'Late dispute',
        evidenceIds: [valid.id],
      }),
    ).rejects.toThrow('window');
  });

  it('records seller reply without resetting SLA and blocks escrow settlement while open', async () => {
    const f = await fixture();
    const photo = await evidence(f);
    const issue = await service.openIssue(f.buyer.id, f.order.id, {
      productId: f.productId,
      kind: 'WRONG_ITEM',
      description: 'Different item',
      evidenceIds: [photo.id],
    });
    const reply = await service.reply(f.owner.id, issue.id, {
      text: 'Packing video attached',
      evidenceIds: [],
    });
    expect(reply.party).toBe('SELLER');
    expect(
      await f.db.getRepository(DisputeMessage).countBy({ issueId: issue.id }),
    ).toBe(1);
    expect(
      (await f.db.getRepository(DisputeIssue).findOneByOrFail({ id: issue.id }))
        .reviewDueAt,
    ).toEqual(issue.reviewDueAt);

    await f.db.getRepository(Order).update(f.order.id, { status: 'completed' });
    const funding = new OrderFundingService();
    const spy = jest.spyOn(funding, 'heldCredit');
    await new OrderSettlementService(
      f.db,
      funding,
      new OutboxService(),
    ).settleOrder(f.order.id);
    expect(spy).not.toHaveBeenCalled();
  });
});
