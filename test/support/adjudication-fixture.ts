import { randomUUID } from 'node:crypto';

import ms from 'ms';
import type { DataSource } from 'typeorm';

import { AuthProvider } from '@/modules/auth/enums';
import { DisputeAttachment } from '@/modules/dispute/entities/dispute-attachment.entity';
import { DisputeCase } from '@/modules/dispute/entities/dispute-case.entity';
import { DisputeEvidence } from '@/modules/dispute/entities/dispute-evidence.entity';
import { DisputeIssue } from '@/modules/dispute/entities/dispute-issue.entity';
import { Order } from '@/modules/order/entities';
import { businessDeadline } from '@/modules/shipment/utils/business-calendar';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { createPrivateMedia } from './private-media';

export async function adjudicationFixture(db: DataSource) {
  const [buyer, owner, admin] = await db.getRepository(User).save(
    [UserRole.USER, UserRole.USER, UserRole.ADMIN].map((role) => ({
      email: `${randomUUID()}@test.local`,
      fullName: 'Decision test',
      provider: AuthProvider.CREDENTIALS,
      status: UserStatus.ACTIVE,
      role,
    })),
  );
  const shop = await db.getRepository(Shop).save({ name: 'Decision Shop' });
  await db.getRepository(ShopMember).save({
    shopId: shop.id,
    userId: owner.id,
    memberRole: ShopMemberRole.OWNER,
  });
  const productId = randomUUID();
  const order = await db.getRepository(Order).save({
    checkoutOrderId: randomUUID(),
    buyerId: buyer.id,
    shopId: shop.id,
    shopName: shop.name,
    status: 'dispute',
    paymentMethod: 'COD',
    subtotal: 100001,
    shippingFee: 30000,
    total: 130001,
    createdAt: new Date(Date.now() - ms('7d')),
    sellerConfirmBy: new Date(),
    deliveryObservedAt: new Date(Date.now() - ms('5d')),
    address: {},
    items: [
      {
        productId,
        title: 'Jacket snapshot',
        price: 100001,
        size: null,
        condition: 'GOOD',
        coverUrl: null,
        shippingPackage: null,
      },
    ],
  });
  const row = await db.getRepository(DisputeCase).save({
    orderId: order.id,
    buyerId: buyer.id,
    shopId: shop.id,
    state: 'OPEN',
    previousOrderStatus: 'completed',
  });
  const validAt = new Date(Date.now() - ms('4d'));
  const issue = await db.getRepository(DisputeIssue).save({
    caseId: row.id,
    productId,
    kind: 'WRONG_ITEM',
    description: 'Not the jacket from listing',
    status: 'ACTIVE',
    createdAt: validAt,
    supplementBy: new Date(validAt.getTime() + ms('24h')),
    validAt,
    sellerNotifiedAt: validAt,
    sellerRespondBy: businessDeadline(validAt, 1),
    reviewDueAt: businessDeadline(validAt, 3),
    maxReviewDueAt: businessDeadline(validAt, 5),
  });
  const media = await createPrivateMedia(db, buyer.id);
  const evidence = await db.getRepository(DisputeEvidence).save({
    orderId: order.id,
    uploadedById: buyer.id,
    mediaId: media.id,
    media,
    tags: ['ISSUE'],
  });
  await db
    .getRepository(DisputeAttachment)
    .save({ issueId: issue.id, evidenceId: evidence.id });
  return { buyer, owner, admin, shop, order, row, issue, evidence };
}
