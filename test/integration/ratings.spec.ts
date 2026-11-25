import { randomUUID } from 'node:crypto';

import { AuthProvider } from '@/modules/auth/enums';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { ShopMemberRoleAssignment } from '@/modules/authorization/entities/shop-member-role-assignment.entity';
import { ShopRolePermission } from '@/modules/authorization/entities/shop-role-permission.entity';
import { ShopRole } from '@/modules/authorization/entities/shop-role.entity';
import { Order } from '@/modules/order/entities';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import {
  ShopRating,
  ShopRatingModerationAudit,
  ShopRatingNotice,
  ShopRatingVersion,
} from '@/modules/ratings/entities';
import { RatingsService } from '@/modules/ratings/ratings.service';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Verified Shop ratings (PostgreSQL)', () => {
  let database: TestDatabase;
  let ratings: RatingsService;
  beforeAll(async () => {
    database = await createTestDatabase();
    const auth = new AuthorizationService(database.dataSource);
    ratings = new RatingsService(database.dataSource, auth);
  });
  afterAll(async () => database?.destroy());
  async function fixture() {
    const db = database.dataSource;
    const createUser = (role = UserRole.USER) =>
      db.getRepository(User).save({
        email: `${randomUUID()}@test.local`,
        fullName: 'Rating actor',
        provider: AuthProvider.CREDENTIALS,
        status: UserStatus.ACTIVE,
        role,
      });
    const buyer = await createUser();
    const owner = await createUser();
    const staff = await createUser();
    const admin = await createUser(UserRole.ADMIN);
    const shop = await db.getRepository(Shop).save({ name: 'Rating shop' });
    for (const [user, memberRole] of [
      [owner, ShopMemberRole.OWNER],
      [staff, ShopMemberRole.STAFF],
    ] as const)
      await db
        .getRepository(ShopMember)
        .save({ userId: user.id, shopId: shop.id, memberRole });
    const deliveredAt = new Date(Date.now() - 3600000);
    const order = await db.getRepository(Order).save({
      checkoutOrderId: randomUUID(),
      buyerId: buyer.id,
      shopId: shop.id,
      shopName: shop.name,
      paymentMethod: 'COD',
      status: 'completed',
      subtotal: 100000,
      shippingFee: 0,
      total: 100000,
      sellerConfirmBy: new Date(),
      deliveryVerifiedAt: deliveredAt,
      address: {},
      items: [],
    });
    const proof = await db.getRepository(OrderDeliveryVerification).save({
      orderId: order.id,
      deliveredAt,
      disputeDeadlineAt: new Date(),
      mode: 'EVIDENCE',
      actorId: admin.id,
      reason: 'Verified carrier',
      evidence: 'Signed carrier receipt',
    });
    const input = {
      orderId: order.id,
      stars: 1,
      comment: 'Bad experience',
      mediaIds: [],
    };
    return { db, buyer, owner, staff, admin, shop, order, proof, input };
  }
  it('keeps one buyer/Shop row through concurrent edits and durable histories/notices', async () => {
    const f = await fixture();
    await Promise.all([
      ratings.upsert(f.buyer.id, f.input),
      ratings.upsert(f.buyer.id, { ...f.input, stars: 2 }),
    ]);
    const rows = await f.db
      .getRepository(ShopRating)
      .findBy({ buyerId: f.buyer.id, shopId: f.shop.id });
    expect(rows).toHaveLength(1);
    expect(rows[0].revision).toBe(2);
    expect(
      await f.db
        .getRepository(ShopRatingVersion)
        .countBy({ ratingId: rows[0].id, kind: 'BUYER' }),
    ).toBe(2);
    expect(
      await f.db
        .getRepository(ShopRatingNotice)
        .countBy({ ratingId: rows[0].id }),
    ).toBe(1);
  });
  it('requires delivery verification and preserves eligibility after dispute/return', async () => {
    const f = await fixture();
    await f.db.getRepository(OrderDeliveryVerification).delete(f.proof.id);
    await expect(ratings.upsert(f.buyer.id, f.input)).rejects.toThrow(
      'Verified delivery',
    );
    await f.db.getRepository(OrderDeliveryVerification).save(f.proof);
    await f.db.getRepository(Order).update(f.order.id, { status: 'dispute' });
    await expect(ratings.upsert(f.buyer.id, f.input)).resolves.toMatchObject({
      stars: 1,
    });
  });
  it('denies implicit Staff reply, keeps Owner reply on buyer edits, preserves reply history', async () => {
    const f = await fixture();
    const row = await ratings.upsert(f.buyer.id, f.input);
    await expect(ratings.reply(f.staff.id, row.id, 'Staff')).rejects.toThrow(
      'Shop rating reply permission required',
    );
    await ratings.reply(f.owner.id, row.id, 'We will improve');
    await ratings.reply(f.owner.id, row.id, 'Updated reply');
    const updated = await ratings.upsert(f.buyer.id, { ...f.input, stars: 2 });
    expect(updated.reply).toBe('Updated reply');
    const history = await ratings.replyHistory(f.owner.id, row.id);
    expect(history.map((version) => version.snapshot)).toEqual([
      { text: 'We will improve' },
      { text: 'Updated reply' },
    ]);
    await expect(ratings.replyHistory(f.staff.id, row.id)).rejects.toThrow(
      'Shop rating reply permission required',
    );
    expect(
      await f.db
        .getRepository(ShopRatingVersion)
        .countBy({ ratingId: row.id, kind: 'REPLY' }),
    ).toBe(2);
  });
  it('retains valid stars on component moderation and prevents buyer edits from resurrecting content', async () => {
    const f = await fixture();
    const row = await ratings.upsert(f.buyer.id, f.input);
    await ratings.moderate(f.admin.id, row.id, {
      component: 'comment',
      hidden: true,
      basis: 'CONTENT_VIOLATION',
      reason: 'Abusive text',
      evidence: 'Reviewed text',
    });
    await ratings.upsert(f.buyer.id, {
      ...f.input,
      comment: 'Changed after moderation',
    });
    const page = await ratings.publicShop(f.shop.id, 'EVIDENCE', 0);
    expect(page.summary.count).toBe(1);
    expect(page.ratings[0].comment).toBeNull();
    await expect(
      ratings.moderate(f.owner.id, row.id, {
        component: 'rating',
        hidden: true,
        basis: 'FRAUD',
        reason: 'Bad',
        evidence: 'Allegation',
      }),
    ).rejects.toThrow('Admin required');
    await ratings.moderate(f.admin.id, row.id, {
      component: 'rating',
      hidden: true,
      basis: 'FRAUD',
      reason: 'Verified fake transaction',
      evidence: 'Investigation case',
    });
    expect(
      (await ratings.publicShop(f.shop.id, 'EVIDENCE', 0)).summary.count,
    ).toBe(0);
  });
  it('isolates simulation publicly while the buyer can see their own rating in every mode', async () => {
    const f = await fixture();
    await f.db
      .getRepository(OrderDeliveryVerification)
      .update(f.proof.id, { mode: 'SIMULATION' });
    await ratings.upsert(f.buyer.id, f.input);
    expect(
      (await ratings.publicShop(f.shop.id, 'EVIDENCE', 0)).summary.count,
    ).toBe(0);
    expect(
      (await ratings.publicShop(f.shop.id, 'SIMULATION', 0)).summary.count,
    ).toBe(1);
    expect(await ratings.mine(f.buyer.id, 0)).toHaveLength(1);
  });
  it('allows explicitly granted Staff replies and denies them immediately after revocation', async () => {
    const f = await fixture();
    const row = await ratings.upsert(f.buyer.id, f.input);
    const member = await f.db
      .getRepository(ShopMember)
      .findOneByOrFail({ userId: f.staff.id });
    const role = await f.db
      .getRepository(ShopRole)
      .save({ shopId: f.shop.id, name: 'Rating responder' });
    await f.db
      .getRepository(ShopMemberRoleAssignment)
      .save({ memberId: member.id, roleId: role.id });
    await f.db
      .getRepository(ShopRolePermission)
      .save({ roleId: role.id, permissionKey: 'rating.reply' });
    await expect(
      ratings.reply(f.staff.id, row.id, 'Authorized Staff reply'),
    ).resolves.toMatchObject({ reply: 'Authorized Staff reply' });
    await f.db.getRepository(ShopRolePermission).delete({ roleId: role.id });
    await expect(
      ratings.reply(f.staff.id, row.id, 'After revocation'),
    ).rejects.toThrow('Shop rating reply permission required');
  });
  it('rejects stale moderation approvals and keeps edited Shop replies hidden until current review', async () => {
    const f = await fixture();
    const row = await ratings.upsert(f.buyer.id, f.input);
    await ratings.reply(f.owner.id, row.id, 'First reply');
    await ratings.moderate(f.admin.id, row.id, {
      component: 'reply',
      hidden: true,
      basis: 'CONTENT_VIOLATION',
      reason: 'Reviewed abusive reply',
      evidence: 'Reply review',
    });
    await ratings.reply(f.owner.id, row.id, 'Changed reply');
    const restore = {
      component: 'reply',
      hidden: false,
      basis: 'REVIEW_APPROVED',
      reason: 'Current reply is compliant',
      evidence: 'Review case',
      expectedReplyRevision: 1,
    } as const;
    await expect(ratings.moderate(f.admin.id, row.id, restore)).rejects.toThrow(
      'Rating changed',
    );
    expect((await ratings.publicShop(f.shop.id)).ratings[0].reply).toBeNull();
    await ratings.moderate(f.admin.id, row.id, {
      ...restore,
      expectedReplyRevision: 2,
    });
    expect((await ratings.publicShop(f.shop.id)).ratings[0].reply).toBe(
      'Changed reply',
    );
    expect(
      await f.db
        .getRepository(ShopRatingModerationAudit)
        .countBy({ ratingId: row.id }),
    ).toBe(2);
  });
  it('updates one cross-mode buyer/Shop rating when a legitimate later order becomes the basis', async () => {
    const f = await fixture();
    await f.db
      .getRepository(OrderDeliveryVerification)
      .update(f.proof.id, { mode: 'SIMULATION' });
    const original = await ratings.upsert(f.buyer.id, f.input);
    const laterOrder = await f.db.getRepository(Order).save({
      ...f.order,
      id: randomUUID(),
      checkoutOrderId: randomUUID(),
      orderCode: `RW-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`,
    });
    await f.db.getRepository(OrderDeliveryVerification).save({
      ...f.proof,
      id: randomUUID(),
      orderId: laterOrder.id,
      mode: 'EVIDENCE',
    });
    const updated = await ratings.upsert(f.buyer.id, {
      ...f.input,
      orderId: laterOrder.id,
      stars: 5,
    });
    expect(updated.id).toBe(original.id);
    expect((await ratings.publicShop(f.shop.id)).summary).toMatchObject({
      count: 1,
      average: 5,
    });
    expect(
      (await ratings.publicShop(f.shop.id, 'SIMULATION')).summary.count,
    ).toBe(0);
    expect(
      await f.db
        .getRepository(ShopRating)
        .countBy({ shopId: f.shop.id, buyerId: f.buyer.id }),
    ).toBe(1);
  });
  it('requires active actors for edits and protects private version history', async () => {
    const f = await fixture();
    const row = await ratings.upsert(f.buyer.id, f.input);
    await expect(ratings.history(f.staff.id, row.id)).rejects.toThrow(
      'Admin required',
    );
    expect(await ratings.history(f.admin.id, row.id)).toHaveLength(1);
    await f.db
      .getRepository(User)
      .update(f.buyer.id, { status: UserStatus.INACTIVE });
    await expect(ratings.upsert(f.buyer.id, f.input)).rejects.toThrow(
      'Active user required',
    );
  });
});
