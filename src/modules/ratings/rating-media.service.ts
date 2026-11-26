import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, type EntityManager, MoreThan } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';
import { MediaService } from '@/modules/media/media.service';

import { RATING_MIME_TYPES, RATING_POLICY } from './constants/rating.constant';
import { ShopRating, ShopRatingMedia } from './entities';
import { RatingsService } from './ratings.service';
import {
  type RatingMode,
  ratingModeSchema,
  type RatingUploadInput,
  ratingUploadSchema,
} from './schemas/rating.schema';

@Injectable()
export class RatingMediaService {
  constructor(
    private readonly db: DataSource,
    private readonly ratings: RatingsService,
    private readonly storage: StorageService,
    private readonly media: MediaService,
  ) {}

  private async find(manager: EntityManager, id: string) {
    const row = await manager.findOneBy(ShopRatingMedia, { id });
    if (!row) throw new NotFoundException('Rating media not found');
    return row;
  }

  async attach(buyerId: string, input: RatingUploadInput) {
    const parsed = ratingUploadSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Invalid rating media upload');
    return this.db.transaction(async (manager) => {
      const now = await this.ratings.clock(manager);
      const { order, proof } = await this.ratings.assertEligible(
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
      const file = await this.media.verifyMedia(
        manager,
        buyerId,
        parsed.data.mediaId,
        undefined,
        'private',
      );
      const limit = file.mimeType.startsWith('image/')
        ? RATING_POLICY.IMAGE_BYTES
        : RATING_POLICY.VIDEO_BYTES;
      if (
        !RATING_MIME_TYPES.some((mimeType) => mimeType === file.mimeType) ||
        file.sizeBytes > limit
      )
        throw new BadRequestException('Invalid rating media');
      const row = await manager.getRepository(ShopRatingMedia).save({
        buyerId,
        shopId: order.shopId,
        orderId: order.id,
        mode: proof.mode,
        mediaId: file.id,
      });
      return { id: row.id, mimeType: file.mimeType, sizeBytes: file.sizeBytes };
    });
  }

  async download(id: string, mode: RatingMode = 'EVIDENCE') {
    const parsed = ratingModeSchema.safeParse(mode);
    if (!parsed.success) throw new BadRequestException('Invalid rating mode');
    return this.db.transaction(async (manager) => {
      const row = await this.find(manager, id);
      const rating = await manager.findOneBy(ShopRating, {
        buyerId: row.buyerId,
        shopId: row.shopId,
        mode: parsed.data,
        invalidated: false,
        mediaHidden: false,
      });
      if (
        row.media.retiredAt ||
        row.mode !== parsed.data ||
        !rating?.mediaIds.includes(id)
      )
        throw new NotFoundException('Visible rating media not found');
      return this.storage.createDownloadUrl(row.media.storageKey);
    });
  }
}
