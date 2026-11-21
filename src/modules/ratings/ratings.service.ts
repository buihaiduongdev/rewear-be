import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import {
  ShopRating,
  ShopRatingMedia,
  ShopRatingModerationAudit,
  ShopRatingNotice,
  ShopRatingVersion,
} from './entities/shop-rating.entity';
import { RatingAccess } from './rating.access';
import { publicRating, summarizeRatings } from './rating.policy';
import {
  ratingInputSchema,
  ratingModerationSchema,
  ratingModeSchema,
  ratingReplySchema,
} from './schemas/rating.schema';
import type {
  RatingInput,
  RatingMode,
  RatingModerationInput,
} from './types/rating.type';

@Injectable()
export class RatingsService {
  constructor(
    private readonly db: DataSource,
    private readonly access: RatingAccess,
  ) {}
  async clock(manager: EntityManager) {
    // Serialize rating edits, moderation and signed-media authorization across workers.
    await manager.query('SELECT pg_advisory_xact_lock(782145, 1)');
    const [row] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(row.now);
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
      ready: true,
    });
    if (media.length !== mediaIds.length || media.some((row) => !row.eTag))
      throw new BadRequestException(
        'Only owned completed Shop rating uploads can be attached',
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
      const { order, proof } = await this.access.eligible(
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
      const repo = manager.getRepository(ShopRating);
      let row = await repo.findOneBy({ buyerId, shopId: order.shopId });
      const editing = Boolean(row);
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
      // Hidden flags and invalidation deliberately survive every author edit.
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
      if (editing)
        await manager.getRepository(ShopRatingNotice).save({
          ratingId: row.id,
          shopId: row.shopId,
          revision: row.revision,
        });
      return this.privateView(row);
    });
  }
  async reply(actorId: string, ratingId: string, text: string) {
    const parsed = ratingReplySchema.safeParse({ text });
    if (!parsed.success) throw new BadRequestException('Invalid rating reply');
    return this.db.transaction(async (manager) => {
      await this.clock(manager);
      const row = await this.find(manager, ratingId);
      await this.access.reply(manager, actorId, row.shopId);
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
      await this.clock(manager);
      await this.access.admin(manager, actorId);
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
    await this.access.activeUser(this.db.manager, buyerId);
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
    await this.access.activeUser(manager, actorId);
    const row = await this.find(manager, ratingId);
    if (row.buyerId !== actorId) await this.access.admin(manager, actorId);
    return manager.find(ShopRatingVersion, {
      where: { ratingId },
      order: { createdAt: 'ASC', id: 'ASC' },
      skip: offset,
      take: 50,
    });
  }
  async notices(actorId: string, shopId: string, offset = 0) {
    await this.access.reply(this.db.manager, actorId, shopId);
    return this.db.manager.find(ShopRatingNotice, {
      where: { shopId },
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: offset,
      take: 50,
    });
  }
  async replyHistory(actorId: string, ratingId: string, offset = 0) {
    const manager = this.db.manager;
    const row = await this.find(manager, ratingId);
    await this.access.reply(manager, actorId, row.shopId);
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
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const rows = await manager.find(ShopRating, {
        where: { shopId, mode: parsed.data, invalidated: false },
        order: { updatedAt: 'DESC', id: 'ASC' },
      });
      return {
        summary: summarizeRatings(rows, parsed.data),
        ratings: rows.slice(offset, offset + 50).map(publicRating),
      };
    });
  }
}
