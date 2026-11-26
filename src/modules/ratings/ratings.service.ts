import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, type EntityManager, In } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { MediaService } from '@/modules/media/media.service';
import { Order } from '@/modules/order/entities';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { RATING_MIME_TYPES, RATING_POLICY } from './constants/rating.constant';
import { ShopRating, ShopRatingMedia, ShopRatingVersion } from './entities';
import {
  type RatingInput,
  ratingInputSchema,
  type RatingMode,
  type RatingModerationInput,
  ratingModerationSchema,
  ratingModeSchema,
  ratingReplySchema,
} from './schemas/rating.schema';

export function hasDeliveryProof(
  order: { deliveryVerifiedAt?: Date | null; cancelledAt?: Date | null },
  proof: {
    deliveredAt: Date;
    mode: string;
    actorId: string;
    reason: string;
    evidence: string;
  } | null,
  now: Date,
) {
  return Boolean(
    proof &&
    proof.deliveredAt <= now &&
    (!order.cancelledAt || order.cancelledAt > proof.deliveredAt) &&
    order.deliveryVerifiedAt?.getTime() === proof.deliveredAt.getTime() &&
    ['EVIDENCE', 'SIMULATION'].includes(proof.mode) &&
    proof.actorId &&
    proof.reason?.trim() &&
    proof.evidence?.trim(),
  );
}

export function publicRating(row: ShopRating, mediaUrls: string[] = []) {
  return {
    id: row.id,
    shopId: row.shopId,
    stars: row.stars,
    comment: row.commentHidden ? null : row.comment,
    mediaIds: row.mediaHidden ? [] : row.mediaIds,
    mediaUrls: row.mediaHidden ? [] : mediaUrls,
    reply: row.replyHidden ? null : row.reply,
    revision: row.revision,
    updatedAt: row.updatedAt,
    mode: row.mode,
    verifiedTransaction: true,
  };
}

export function summarizeRatings(rows: ShopRating[], mode: RatingMode) {
  const eligible = rows.filter((row) => row.mode === mode && !row.invalidated);
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of eligible) distribution[row.stars]++;
  return {
    mode,
    count: eligible.length,
    average: eligible.length
      ? eligible.reduce((sum, row) => sum + row.stars, 0) / eligible.length
      : null,
    distribution,
    verifiedBuyerCount: new Set(eligible.map((row) => row.buyerId)).size,
  };
}

@Injectable()
export class RatingsService {
  constructor(
    private readonly db: DataSource,
    private readonly authorization: AuthorizationService,
    private readonly storage: StorageService,
    private readonly media: MediaService,
  ) {}

  async assertActiveUser(manager: EntityManager, userId: string) {
    const user = await manager.findOneBy(User, {
      id: userId,
      status: UserStatus.ACTIVE,
    });
    if (!user) throw new ForbiddenException('Active user required');
    return user;
  }

  async assertEligible(
    manager: EntityManager,
    buyerId: string,
    orderId: string,
    now: Date,
  ) {
    await this.assertActiveUser(manager, buyerId);
    const order = await manager.findOneBy(Order, { id: orderId, buyerId });
    if (!order) throw new NotFoundException('Order not found');
    const proof = await manager.findOneBy(OrderDeliveryVerification, {
      orderId,
    });
    if (!hasDeliveryProof(order, proof, now))
      throw new ForbiddenException('Verified delivery required to rate Shop');
    return { order, proof: proof! };
  }

  private async assertReplyAccess(
    manager: EntityManager,
    actorId: string,
    shopId: string,
  ) {
    await this.assertActiveUser(manager, actorId);
    const shop = await manager.findOneBy(Shop, {
      id: shopId,
      status: ShopStatus.ACTIVE,
    });
    if (
      !shop ||
      !(await this.authorization.hasPermission(
        actorId,
        shopId,
        SHOP_PERMISSIONS.RATING_REPLY,
        manager,
      ))
    )
      throw new ForbiddenException('Shop rating reply permission required');
  }

  private async assertAdmin(manager: EntityManager, actorId: string) {
    const actor = await this.assertActiveUser(manager, actorId);
    if (actor.role !== UserRole.ADMIN)
      throw new ForbiddenException('Admin required');
  }

  async find(manager: EntityManager, id: string) {
    const row = await manager.findOneBy(ShopRating, { id });
    if (!row) throw new NotFoundException('Rating not found');
    return row;
  }

  private async attachMedia(
    manager: EntityManager,
    buyerId: string,
    order: Order,
    mode: RatingMode,
    mediaIds: string[],
  ) {
    if (!mediaIds.length) return;
    const existing = await manager.findBy(ShopRatingMedia, {
      mediaId: In(mediaIds),
      buyerId,
      shopId: order.shopId,
    });
    if (existing.some((row) => row.media.retiredAt))
      throw new BadRequestException(
        'Only owned Shop rating media can be attached',
      );
    if (existing.length) {
      await manager.update(
        ShopRatingMedia,
        { id: In(existing.map((row) => row.id)) },
        { mode, orderId: order.id },
      );
    }
    const existingIds = new Set(existing.map((row) => row.mediaId));
    for (const mediaId of mediaIds) {
      if (existingIds.has(mediaId)) continue;
      const file = await this.media.verifyMedia(
        manager,
        buyerId,
        mediaId,
        undefined,
        'public',
      );
      const limit = file.mimeType.startsWith('image/')
        ? RATING_POLICY.IMAGE_BYTES
        : RATING_POLICY.VIDEO_BYTES;
      if (
        !RATING_MIME_TYPES.some((mimeType) => mimeType === file.mimeType) ||
        file.sizeBytes > limit
      )
        throw new BadRequestException('Invalid rating media');
      await manager.getRepository(ShopRatingMedia).save({
        buyerId,
        shopId: order.shopId,
        orderId: order.id,
        mode,
        mediaId: file.id,
      });
    }
  }

  private async version(
    manager: EntityManager,
    row: ShopRating,
    actorId: string,
    kind: 'BUYER' | 'REPLY',
  ) {
    const snapshot =
      kind === 'BUYER'
        ? {
            orderId: row.orderId,
            deliveryVerificationId: row.deliveryVerificationId,
            mode: row.mode,
            stars: row.stars,
            comment: row.comment,
            mediaIds: row.mediaIds,
          }
        : { text: row.reply };
    await manager.getRepository(ShopRatingVersion).save({
      ratingId: row.id,
      actorId,
      kind,
      revision: kind === 'BUYER' ? row.revision : row.replyRevision,
      snapshot,
    });
  }

  async upsert(buyerId: string, input: RatingInput) {
    const parsed = ratingInputSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Invalid rating');
    const value = parsed.data;
    return this.db.transaction(async (manager) => {
      const now = new Date();
      const { order, proof } = await this.assertEligible(
        manager,
        buyerId,
        value.orderId,
        now,
      );
      await this.attachMedia(
        manager,
        buyerId,
        order,
        proof.mode,
        value.mediaIds,
      );
      await manager.findOneOrFail(User, {
        where: { id: buyerId },
        lock: { mode: 'pessimistic_write' },
      });
      const repo = manager.getRepository(ShopRating);
      let row = await repo.findOneBy({ buyerId, shopId: order.shopId });
      if (!row)
        row = repo.create({
          buyerId,
          shopId: order.shopId,
          revision: 0,
          reply: null,
          replyRevision: 0,
          commentHidden: false,
          mediaHidden: false,
          replyHidden: false,
          invalidated: false,
        });
      Object.assign(row, {
        orderId: order.id,
        deliveryVerificationId: proof.id,
        mode: proof.mode,
        stars: value.stars,
        comment: value.comment,
        mediaIds: value.mediaIds,
        revision: row.revision + 1,
      });
      row = await repo.save(row);
      await this.version(manager, row, buyerId, 'BUYER');
      return this.privateView(row);
    });
  }

  async reply(actorId: string, ratingId: string, text: string) {
    const parsed = ratingReplySchema.safeParse({ text });
    if (!parsed.success) throw new BadRequestException('Invalid rating reply');
    return this.db.transaction(async (manager) => {
      const row = await this.find(manager, ratingId);
      await this.assertReplyAccess(manager, actorId, row.shopId);
      row.reply = parsed.data.text;
      row.replyRevision++;
      await manager.save(row);
      await this.version(manager, row, actorId, 'REPLY');
      return {
        ...publicRating(row),
        reply: row.reply,
        replyHidden: row.replyHidden,
        replyRevision: row.replyRevision,
      };
    });
  }

  async moderate(
    actorId: string,
    ratingId: string,
    input: RatingModerationInput,
  ) {
    const parsed = ratingModerationSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        'Verified moderation basis required; low stars are not a violation',
      );
    return this.db.transaction(async (manager) => {
      await this.assertAdmin(manager, actorId);
      const row = await this.find(manager, ratingId);
      const decision = parsed.data;
      if (decision.component === 'rating') row.invalidated = decision.hidden;
      if (decision.component === 'comment') row.commentHidden = decision.hidden;
      if (decision.component === 'media') row.mediaHidden = decision.hidden;
      if (decision.component === 'reply') row.replyHidden = decision.hidden;
      await manager.save(row);
      return this.privateView(
        row,
        (await this.resolveMediaUrls(manager, [row])).get(row.id) ?? [],
      );
    });
  }

  private async resolveMediaUrls(manager: EntityManager, rows: ShopRating[]) {
    const allIds = [...new Set(rows.flatMap((row) => row.mediaIds))];
    const map = new Map<string, string[]>();
    if (!allIds.length) return map;
    const links = await manager.findBy(ShopRatingMedia, {
      mediaId: In(allIds),
    });
    const urlByMediaId = new Map(
      links
        .filter((link) => !link.media.retiredAt)
        .map((link) => [
          link.mediaId,
          this.storage.getPublicUrl(link.media.storageKey),
        ]),
    );
    for (const row of rows) {
      map.set(
        row.id,
        row.mediaIds
          .map((id) => urlByMediaId.get(id))
          .filter((url): url is string => !!url),
      );
    }
    return map;
  }

  private privateView(row: ShopRating, mediaUrls: string[] = []) {
    return {
      ...publicRating(row, mediaUrls),
      orderId: row.orderId,
      comment: row.comment,
      mediaIds: row.mediaIds,
      mediaUrls,
      reply: row.reply,
      replyRevision: row.replyRevision,
      commentHidden: row.commentHidden,
      mediaHidden: row.mediaHidden,
      replyHidden: row.replyHidden,
      invalidated: row.invalidated,
      createdAt: row.createdAt,
    };
  }

  async mine(buyerId: string, offset = 0) {
    await this.assertActiveUser(this.db.manager, buyerId);
    const rows = await this.db.manager.find(ShopRating, {
      where: { buyerId },
      order: { updatedAt: 'DESC', id: 'ASC' },
      skip: offset,
      take: 50,
    });
    const urlMap = await this.resolveMediaUrls(this.db.manager, rows);
    return rows.map((row) => this.privateView(row, urlMap.get(row.id) ?? []));
  }

  async history(actorId: string, ratingId: string, offset = 0) {
    const manager = this.db.manager;
    await this.assertActiveUser(manager, actorId);
    const row = await this.find(manager, ratingId);
    if (row.buyerId !== actorId) await this.assertAdmin(manager, actorId);
    return manager.find(ShopRatingVersion, {
      where: { ratingId },
      order: { createdAt: 'ASC', id: 'ASC' },
      skip: offset,
      take: 50,
    });
  }

  async replyHistory(actorId: string, ratingId: string, offset = 0) {
    const manager = this.db.manager;
    const row = await this.find(manager, ratingId);
    await this.assertReplyAccess(manager, actorId, row.shopId);
    return manager.find(ShopRatingVersion, {
      where: { ratingId, kind: 'REPLY' },
      order: { revision: 'ASC' },
      skip: offset,
      take: 50,
    });
  }

  async publicShop(shopId: string, mode: RatingMode = 'EVIDENCE', offset = 0) {
    const parsed = ratingModeSchema.safeParse(mode);
    if (!parsed.success) throw new BadRequestException('Invalid rating mode');
    const rows = await this.db.manager.find(ShopRating, {
      where: { shopId, mode: parsed.data, invalidated: false },
      order: { updatedAt: 'DESC', id: 'ASC' },
    });
    const pageRows = rows.slice(offset, offset + 50);
    const urlMap = await this.resolveMediaUrls(this.db.manager, pageRows);
    return {
      summary: summarizeRatings(rows, parsed.data),
      ratings: pageRows.map((row) =>
        publicRating(row, urlMap.get(row.id) ?? []),
      ),
    };
  }
}
