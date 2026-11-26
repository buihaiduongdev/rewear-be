import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, type EntityManager, In } from 'typeorm';

import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { Order } from '@/modules/order/entities';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import {
  ShopRating,
  ShopRatingMedia,
  ShopRatingModerationAudit,
  ShopRatingVersion,
} from './entities';
import {
  hasDeliveryProof,
  publicRating,
  summarizeRatings,
} from './rating.policy';
import {
  type RatingInput,
  ratingInputSchema,
  type RatingMode,
  type RatingModerationInput,
  ratingModerationSchema,
  ratingModeSchema,
  ratingReplySchema,
} from './schemas/rating.schema';

@Injectable()
export class RatingsService {
  constructor(
    private readonly db: DataSource,
    private readonly authorization: AuthorizationService,
  ) {}

  async clock(manager: EntityManager) {
    const [row] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(row.now);
  }

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

  private async media(
    manager: EntityManager,
    buyerId: string,
    shopId: string,
    mode: RatingMode,
    mediaIds: string[],
  ) {
    if (!mediaIds.length) return;
    const media = await manager.findBy(ShopRatingMedia, {
      id: In(mediaIds),
      buyerId,
      shopId,
      mode,
    });
    if (
      media.length !== mediaIds.length ||
      media.some((row) => row.media.retiredAt)
    )
      throw new BadRequestException(
        'Only owned Shop rating media can be attached',
      );
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
      const now = await this.clock(manager);
      const { order, proof } = await this.assertEligible(
        manager,
        buyerId,
        value.orderId,
        now,
      );
      await this.media(
        manager,
        buyerId,
        order.shopId,
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
      if (
        (decision.expectedRevision !== undefined &&
          decision.expectedRevision !== row.revision) ||
        (decision.expectedReplyRevision !== undefined &&
          decision.expectedReplyRevision !== row.replyRevision)
      )
        throw new ConflictException(
          'Rating changed after the reviewed revision',
        );
      const before = {
        commentHidden: row.commentHidden,
        mediaHidden: row.mediaHidden,
        replyHidden: row.replyHidden,
        invalidated: row.invalidated,
      };
      if (decision.component === 'rating') row.invalidated = decision.hidden;
      if (decision.component === 'comment') row.commentHidden = decision.hidden;
      if (decision.component === 'media') row.mediaHidden = decision.hidden;
      if (decision.component === 'reply') row.replyHidden = decision.hidden;
      await manager.save(row);
      await manager.getRepository(ShopRatingModerationAudit).save({
        ratingId,
        actorId,
        decision: { ...decision, before },
        buyerRevision: row.revision,
        replyRevision: row.replyRevision,
      });
      return this.privateView(row);
    });
  }

  private privateView(row: ShopRating) {
    return {
      ...publicRating(row),
      orderId: row.orderId,
      comment: row.comment,
      mediaIds: row.mediaIds,
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
    return rows.map((row) => this.privateView(row));
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
    return {
      summary: summarizeRatings(rows, parsed.data),
      ratings: rows.slice(offset, offset + 50).map(publicRating),
    };
  }
}
