import { NotFoundException } from '@nestjs/common';

import type { DataSource } from 'typeorm';

import type { StorageService } from '@/infrastructure/storage';
import type { AuthorizationService } from '@/modules/authorization/authorization.service';
import type { MediaService } from '@/modules/media/media.service';
import { ShopRating, ShopRatingMedia } from '@/modules/ratings/entities';
import { RatingsService } from '@/modules/ratings/ratings.service';

function fixture() {
  const row = {
    id: 'rating-media',
    mediaId: 'media',
    buyerId: 'buyer',
    shopId: 'shop',
    mode: 'EVIDENCE',
    media: { storageKey: 'private/media', retiredAt: null as Date | null },
  };
  const rating = { mediaIds: ['media'] };
  const manager = {
    findOneBy: jest.fn(async (entity: unknown) =>
      entity === ShopRatingMedia ? row : rating,
    ),
  };
  const db = {
    transaction: async (fn: (manager: unknown) => unknown) => fn(manager),
  };
  const storage = {
    createDownloadUrl: jest.fn(async () => ({
      url: 'https://signed.local/media',
    })),
  };
  const service = new RatingsService(
    db as unknown as DataSource,
    {} as AuthorizationService,
    storage as unknown as StorageService,
    {} as MediaService,
  );
  return { row, rating, manager, storage, service };
}

describe('rating media authorization', () => {
  it('signs only current visible attachments in the requested mode', async () => {
    const f = fixture();
    await expect(f.service.download('media')).resolves.toHaveProperty('url');
    expect(f.storage.createDownloadUrl).toHaveBeenCalledWith(
      f.row.media.storageKey,
    );
    expect(f.manager.findOneBy).toHaveBeenCalledWith(
      ShopRating,
      expect.objectContaining({
        invalidated: false,
        mediaHidden: false,
        mode: 'EVIDENCE',
      }),
    );
    f.rating.mediaIds = [];
    await expect(f.service.download('media')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      f.service.download('media', 'SIMULATION'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('never signs retired or moderated media', async () => {
    const f = fixture();
    f.row.media.retiredAt = new Date();
    await expect(f.service.download('media')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(f.storage.createDownloadUrl).not.toHaveBeenCalled();
    f.row.media.retiredAt = null;
    f.manager.findOneBy.mockImplementation(async (entity: unknown) =>
      entity === ShopRatingMedia ? f.row : (null as never),
    );
    await expect(f.service.download('media')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
