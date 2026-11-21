import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { DataSource } from 'typeorm';

import type { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';
import {
  ShopRating,
  ShopRatingMedia,
} from '@/modules/ratings/entities/shop-rating.entity';
import { RatingMediaService } from '@/modules/ratings/rating-media.service';
import type { RatingAccess } from '@/modules/ratings/rating.access';
import type { RatingsService } from '@/modules/ratings/ratings.service';

function fixture() {
  const row = {
    id: 'media',
    buyerId: 'buyer',
    shopId: 'shop',
    orderId: 'order',
    mode: 'EVIDENCE',
    storageKey: 'shop-rating-media/buyer/shop/media',
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
    ready: false,
    eTag: null,
    uploadExpiresAt: new Date('2026-11-22'),
  };
  const rating = {
    mediaIds: ['media'],
    mediaHidden: false,
    invalidated: false,
  };
  const manager = {
    findOneBy: jest.fn(async (entity: unknown) =>
      entity === ShopRatingMedia ? row : rating,
    ),
    save: jest.fn(async (value: unknown) => value),
  };
  const db = {
    manager,
    transaction: async (fn: (manager: unknown) => unknown) => fn(manager),
  };
  const access = {
    activeUser: jest.fn(async () => ({})),
    eligible: jest.fn(async () => ({
      order: { id: 'order', shopId: 'shop' },
      proof: { mode: 'EVIDENCE' },
    })),
  };
  const ratings = { clock: async () => new Date('2026-11-21') };
  const storage = {
    getObjectMetadata: jest.fn(async () => ({
      eTag: 'etag-v1',
      contentType: 'image/jpeg',
      sizeBytes: 1000,
    })),
    createDownloadUrl: jest.fn(async () => ({
      url: 'https://signed.local/media',
    })),
  };
  const service = new RatingMediaService(
    db as unknown as DataSource,
    access as unknown as RatingAccess,
    ratings as unknown as RatingsService,
    storage as unknown as PrivateEvidenceStorage,
  );
  return { row, rating, manager, access, storage, service };
}
describe('rating media authorization', () => {
  it('rejects completion by another buyer before storage access', async () => {
    const f = fixture();
    await expect(f.service.complete('other', 'media')).rejects.toThrow(
      'Upload belongs to another buyer',
    );
    expect(f.storage.getObjectMetadata).not.toHaveBeenCalled();
  });
  it('verifies HEAD metadata against the immutable ticket and stores ETag', async () => {
    const f = fixture();
    expect(await f.service.complete('buyer', 'media')).toMatchObject({
      ready: true,
    });
    expect(f.row.eTag).toBe('etag-v1');
    f.storage.getObjectMetadata.mockResolvedValueOnce({
      eTag: 'changed-etag',
      contentType: 'image/jpeg',
      sizeBytes: 1000,
    });
    await expect(f.service.complete('buyer', 'media')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it.each([
    { eTag: '', contentType: 'image/jpeg', sizeBytes: 1000 },
    { eTag: 'etag', contentType: 'image/svg+xml', sizeBytes: 1000 },
    { eTag: 'etag', contentType: 'image/jpeg', sizeBytes: 999 },
  ])('rejects mismatched upload metadata %j', async (metadata) => {
    const f = fixture();
    f.storage.getObjectMetadata.mockResolvedValueOnce(metadata);
    await expect(f.service.complete('buyer', 'media')).rejects.toThrow(
      'metadata',
    );
    expect(f.row.ready).toBe(false);
  });
  it('rejects an expired ticket', async () => {
    const f = fixture();
    f.row.uploadExpiresAt = new Date('2026-11-20');
    await expect(f.service.complete('buyer', 'media')).rejects.toThrow(
      'expired',
    );
  });
  it('signs only completed, current, publicly visible attachments in the requested mode', async () => {
    const f = fixture();
    f.row.ready = true;
    Object.assign(f.row, { eTag: 'etag-v1' });
    await expect(f.service.download('media')).resolves.toEqual({
      url: 'https://signed.local/media',
    });
    expect(f.storage.createDownloadUrl).toHaveBeenCalledWith(
      f.row.storageKey,
      'etag-v1',
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
  it('never signs media when moderation makes the current rating unavailable', async () => {
    const f = fixture();
    f.row.ready = true;
    Object.assign(f.row, { eTag: 'etag-v1' });
    f.manager.findOneBy.mockImplementation(async (entity: unknown) =>
      entity === ShopRatingMedia ? f.row : (null as never),
    );
    await expect(f.service.download('media')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(f.storage.createDownloadUrl).not.toHaveBeenCalled();
  });
});
