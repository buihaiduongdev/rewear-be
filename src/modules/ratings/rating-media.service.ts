import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, EntityManager, MoreThan } from 'typeorm';

import { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';

import { RATING_POLICY } from './constants/rating.constant';
import { ShopRating, ShopRatingMedia } from './entities/shop-rating.entity';
import { RatingAccess } from './rating.access';
import { RatingsService } from './ratings.service';
import { ratingModeSchema, ratingUploadSchema } from './schemas/rating.schema';
import type { RatingMode, RatingUploadInput } from './types/rating.type';

@Injectable()
export class RatingMediaService {
  constructor(
    private readonly db: DataSource,
    private readonly access: RatingAccess,
    private readonly ratings: RatingsService,
    private readonly storage: PrivateEvidenceStorage,
  ) {}
  private async find(manager: EntityManager, id: string) {
    const row = await manager.findOneBy(ShopRatingMedia, { id });
    if (!row) throw new NotFoundException('Rating media not found');
    return row;
  }
  async createUpload(buyerId: string, input: RatingUploadInput) {
    const parsed = ratingUploadSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Invalid rating media upload');
    this.storage.assertConfigured();
    const row = await this.db.transaction(async (manager) => {
      const now = await this.ratings.clock(manager);
      const { order, proof } = await this.access.eligible(
        manager,
        buyerId,
        parsed.data.orderId,
        now,
      );
      if (
        (await manager.countBy(ShopRatingMedia, {
          buyerId,
          shopId: order.shopId,
          createdAt: MoreThan(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
        })) >= RATING_POLICY.MAX_UPLOADS_PER_BUYER_SHOP_DAY
      )
        throw new BadRequestException('Rating upload limit reached');
      const id = randomUUID();
      return manager.getRepository(ShopRatingMedia).save({
        id,
        buyerId,
        shopId: order.shopId,
        orderId: order.id,
        mode: proof.mode,
        storageKey: `shop-rating-media/${buyerId}/${order.shopId}/${id}`,
        mimeType: parsed.data.mimeType,
        sizeBytes: parsed.data.sizeBytes,
        ready: false,
        eTag: null,
        uploadExpiresAt: new Date(
          now.getTime() + RATING_POLICY.UPLOAD_SECONDS * 1000,
        ),
      });
    });
    const ticket = await this.storage.createUploadTicket({
      key: row.storageKey,
      contentType: row.mimeType,
      sizeBytes: row.sizeBytes,
    });
    return { id: row.id, ...ticket, expiresAt: row.uploadExpiresAt };
  }
  async complete(buyerId: string, id: string) {
    const original = await this.find(this.db.manager, id);
    if (original.buyerId !== buyerId)
      throw new ForbiddenException('Upload belongs to another buyer');
    await this.access.activeUser(this.db.manager, buyerId);
    const metadata = await this.storage.getObjectMetadata(original.storageKey);
    return this.db.transaction(async (manager) => {
      const now = await this.ratings.clock(manager);
      const row = await this.find(manager, id);
      await this.access.eligible(manager, buyerId, row.orderId, now);
      if (row.buyerId !== buyerId)
        throw new ForbiddenException('Upload belongs to another buyer');
      const mismatch =
        !metadata.eTag ||
        metadata.eTag.length > 255 ||
        metadata.contentType !== row.mimeType ||
        metadata.sizeBytes !== row.sizeBytes ||
        (row.ready && row.eTag !== metadata.eTag);
      if (mismatch)
        throw new BadRequestException(
          'Uploaded media metadata does not match immutable ticket',
        );
      if (!row.ready && now >= row.uploadExpiresAt)
        throw new BadRequestException('Upload ticket expired');
      row.ready = true;
      row.eTag = metadata.eTag!;
      await manager.save(row);
      return {
        id: row.id,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        ready: row.ready,
      };
    });
  }
  async download(id: string, mode: RatingMode = 'EVIDENCE') {
    const parsed = ratingModeSchema.safeParse(mode);
    if (!parsed.success) throw new BadRequestException('Invalid rating mode');
    return this.db.transaction(async (manager) => {
      await this.ratings.clock(manager);
      const row = await this.find(manager, id);
      const rating = await manager.findOneBy(ShopRating, {
        buyerId: row.buyerId,
        shopId: row.shopId,
        mode: parsed.data,
        invalidated: false,
        mediaHidden: false,
      });
      if (
        !row.ready ||
        !row.eTag ||
        row.mode !== parsed.data ||
        !rating?.mediaIds.includes(id)
      )
        throw new NotFoundException('Visible rating media not found');
      // Authorize the current attachment while holding the moderation lock, never a historic version.
      return this.storage.createDownloadUrl(row.storageKey, row.eTag);
    });
  }
}
