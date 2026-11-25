import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { DataSource, EntityManager, Repository } from 'typeorm';

import type { StorageService, UploadTicket } from '@/infrastructure/storage';
import { MAX_PRODUCT_MEDIA } from '@/modules/media/constants';
import { Media, ProductMedia } from '@/modules/media/entities';
import { MediaRole, MediaType } from '@/modules/media/enums';
import { MediaService } from '@/modules/media/media.service';
import { ProductMediaService } from '@/modules/media/product-media.service';
import type { ProductService } from '@/modules/product';

describe('ProductMediaService', () => {
  const productId = '598745cf-8764-499a-ad43-e6223713ee90';
  const userId = 'eb9ab2f0-97dd-456c-809f-75831b227895';
  const mediaId = 'f844ab9a-6f7a-4495-bc34-064bf3bf32d5';
  const secondMediaId = '937cb9f3-b770-4a32-99d4-608d50941b85';
  const uploadId = 'b808027c-5f11-4f46-ab39-eb9e3f520b9c';
  const storageKey = `products/${productId}/${uploadId}.jpg`;
  const now = new Date('2026-10-19T00:00:00.000Z');
  const ticket: UploadTicket = {
    key: storageKey,
    uploadUrl: 'https://upload.example.com/signed',
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    expiresAt: new Date('2026-10-19T00:15:00.000Z'),
  };

  const makeMedia = (id: string, key = `products/${productId}/${id}.jpg`) =>
    ({
      id,
      uploadedById: userId,
      storageKey: key,
      mediaType: MediaType.IMAGE,
      mimeType: 'image/jpeg',
      visibility: 'public',
      sizeBytes: 1024,
      createdAt: now,
      updatedAt: now,
    }) as Media;

  const makeLink = (
    id: string,
    role: MediaRole,
    sortOrder: number,
  ): ProductMedia =>
    ({
      id: `link-${id}`,
      mediaId: id,
      media: makeMedia(id),
      productId,
      role,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    }) as ProductMedia;

  const mediaLinkRepository: jest.Mocked<
    Pick<Repository<ProductMedia>, 'count' | 'find'>
  > = {
    count: jest.fn(),
    find: jest.fn(),
  };
  const manager = {
    count: jest.fn(),
    create: jest.fn((_entity, input: object) => input),
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    getRepository: jest.fn(() => mediaLinkRepository),
    remove: jest.fn(),
    save: jest.fn(),
    query: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn((work: (entityManager: EntityManager) => unknown) =>
      work(manager as unknown as EntityManager),
    ),
  };
  const productService = {
    findOne: jest.fn(),
    findPublishedMedia: jest.fn(),
    findManagedProduct: jest.fn(),
    assertEditable: jest.fn(),
    lockProduct: jest.fn(),
    markContentChanged: jest.fn(),
  };
  const storageService = {
    createUploadTicket: jest.fn(),
    delete: jest.fn(),
    getObjectMetadata: jest.fn(),
    getPublicUrl: jest.fn(),
  };
  const mediaRepository = {
    create: jest.fn((value: object) => value),
    save: jest.fn(async (value: object) => value),
  };
  const uploads = new MediaService(
    mediaRepository as unknown as Repository<Media>,
    storageService as unknown as StorageService,
    {
      storage: {
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
        maxSizeBytes: 10 * 1024 * 1024,
      },
    } as never,
  );
  const service = new ProductMediaService(
    mediaLinkRepository as unknown as Repository<ProductMedia>,
    dataSource as unknown as DataSource,
    productService as unknown as ProductService,
    storageService as unknown as StorageService,
    uploads,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    mediaLinkRepository.count.mockResolvedValue(0);
    manager.create.mockImplementation((_entity, input: object) => input);
    manager.findOne.mockResolvedValue({
      ...makeMedia(mediaId, storageKey),
      isAttached: false,
      retiredAt: null,
    });
    mediaRepository.create.mockImplementation((value: object) => value);
    mediaRepository.save.mockImplementation(async (value: object) => value);
    manager.getRepository.mockReturnValue(mediaLinkRepository);
    dataSource.transaction.mockImplementation((work) =>
      work(manager as unknown as EntityManager),
    );
    storageService.createUploadTicket.mockResolvedValue(ticket);
    storageService.getObjectMetadata.mockResolvedValue({
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    });
    storageService.getPublicUrl.mockReturnValue(
      `https://media.example.com/${storageKey}`,
    );
  });

  it('rejects videos when attaching product media', async () => {
    manager.count.mockResolvedValueOnce(0);
    manager.save.mockResolvedValueOnce({
      ...makeMedia(mediaId),
      mediaType: MediaType.VIDEO,
    });
    manager.findOne.mockResolvedValueOnce({
      ...makeMedia(mediaId),
      mediaType: MediaType.VIDEO,
      isAttached: false,
      retiredAt: null,
    });
    await expect(
      service.confirmUpload(productId, userId, { mediaId }),
    ).rejects.toThrow('Product media must be an image');
  });

  it('returns ordered media only after the public product lookup succeeds', async () => {
    const cover = makeLink(mediaId, MediaRole.COVER, 0);
    productService.findPublishedMedia.mockResolvedValueOnce([cover]);

    await expect(service.findAll(productId)).resolves.toEqual([
      expect.objectContaining({ id: mediaId, role: MediaRole.COVER }),
    ]);
    expect(productService.findOne).toHaveBeenCalledWith(productId);
  });

  it('confirms the first uploaded object and assigns it as the cover', async () => {
    manager.count.mockResolvedValueOnce(0);
    manager.save
      .mockImplementationOnce(async (input: object) => ({
        ...input,
        id: mediaId,
        createdAt: now,
        updatedAt: now,
      }))
      .mockImplementationOnce(async (input: object) => ({
        ...input,
        id: 'link-id',
        createdAt: now,
        updatedAt: now,
      }));

    await expect(
      service.confirmUpload(productId, userId, {
        mediaId,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: mediaId,
        role: MediaRole.COVER,
        sortOrder: 0,
      }),
    );
    expect(storageService.getObjectMetadata).not.toHaveBeenCalled();
    expect(manager.create).toHaveBeenLastCalledWith(
      ProductMedia,
      expect.objectContaining({ role: MediaRole.COVER, sortOrder: 0 }),
    );
  });

  it('retains an uploaded object for retry when the product reaches its media limit', async () => {
    manager.count.mockResolvedValueOnce(MAX_PRODUCT_MEDIA);

    await expect(
      service.confirmUpload(productId, userId, {
        mediaId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storageService.delete).not.toHaveBeenCalled();
  });

  it('does not attach or delete retired media', async () => {
    manager.findOne.mockResolvedValueOnce({
      ...makeMedia(mediaId, storageKey),
      isAttached: true,
      retiredAt: new Date(),
    });

    await expect(
      service.confirmUpload(productId, userId, {
        mediaId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storageService.delete).not.toHaveBeenCalled();
  });

  it('requires a reorder request to contain every current media id', async () => {
    mediaLinkRepository.find.mockResolvedValueOnce([
      makeLink(mediaId, MediaRole.COVER, 0),
      makeLink(secondMediaId, MediaRole.GALLERY, 1),
    ]);

    await expect(
      service.reorder(productId, userId, { mediaIds: [mediaId] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('updates sortOrder via CTE batch query when order changes', async () => {
    const link1 = makeLink(mediaId, MediaRole.COVER, 0);
    const link2 = makeLink(secondMediaId, MediaRole.GALLERY, 1);
    mediaLinkRepository.find.mockResolvedValueOnce([link1, link2]);

    const updatedRows = [
      { mediaId: secondMediaId, sortOrder: 0 },
      { mediaId, sortOrder: 1 },
    ];
    manager.query.mockResolvedValueOnce([updatedRows, 2]);

    const result = await service.reorder(productId, userId, {
      mediaIds: [secondMediaId, mediaId],
    });

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('WITH product_media_count AS'),
      [[secondMediaId, mediaId], productId],
    );
    expect(result).toEqual([
      expect.objectContaining({ id: secondMediaId, sortOrder: 0 }),
      expect.objectContaining({ id: mediaId, sortOrder: 1 }),
    ]);
  });

  it('promotes the next image when deleting the current cover', async () => {
    const cover = makeLink(mediaId, MediaRole.COVER, 0);
    const gallery = makeLink(secondMediaId, MediaRole.GALLERY, 1);
    mediaLinkRepository.find.mockResolvedValueOnce([cover, gallery]);
    manager.count.mockResolvedValueOnce(0);

    const remainingViews = await service.delete(productId, mediaId, userId);
    expect(remainingViews).toEqual([
      expect.objectContaining({
        id: secondMediaId,
        role: MediaRole.COVER,
        sortOrder: 0,
      }),
    ]);
    expect(manager.remove).toHaveBeenNthCalledWith(1, cover);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('WITH new_positions AS'),
      [[secondMediaId], productId, true],
    );
    expect(gallery).toEqual(
      expect.objectContaining({ role: MediaRole.COVER, sortOrder: 0 }),
    );
    expect(cover.media.isAttached).toBe(false);
    expect(cover.media.retiredAt).toBeInstanceOf(Date);
    expect(manager.save).toHaveBeenCalledWith(cover.media);
    expect(storageService.delete).not.toHaveBeenCalled();
  });

  it('rejects setting a cover that is not attached to the product', async () => {
    mediaLinkRepository.find.mockResolvedValueOnce([
      makeLink(mediaId, MediaRole.COVER, 0),
    ]);

    await expect(
      service.setCover(productId, secondMediaId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
