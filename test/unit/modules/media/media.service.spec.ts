import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import type { DataSource, EntityManager, Repository } from 'typeorm';

import type { StorageService, UploadTicket } from '@/infrastructure/storage';
import type { ConfigService } from '@/modules/config';
import { Media, MediaLink } from '@/modules/media/entities';
import { MediaOwnerType, MediaRole, MediaType } from '@/modules/media/enums';
import { MediaService } from '@/modules/media/media.service';
import type { ProductService } from '@/modules/product';

describe('MediaService', () => {
  const productId = '598745cf-8764-499a-ad43-e6223713ee90';
  const userId = 'eb9ab2f0-97dd-456c-809f-75831b227895';
  const mediaId = 'f844ab9a-6f7a-4495-bc34-064bf3bf32d5';
  const secondMediaId = '937cb9f3-b770-4a32-99d4-608d50941b85';
  const uploadId = 'b808027c-5f11-4f46-ab39-eb9e3f520b9c';
  const storageKey = `products/${productId}/${uploadId}.jpg`;
  const now = new Date('2026-10-19T00:00:00.000Z');
  const ticket: UploadTicket = {
    storageKey,
    uploadUrl: 'https://upload.example.com/signed',
    publicUrl: `https://media.example.com/${storageKey}`,
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    expiresAt: new Date('2026-10-19T00:15:00.000Z'),
  };

  const makeMedia = (id: string, key = `products/${productId}/${id}.jpg`) =>
    ({
      id,
      uploadedById: userId,
      storageKey: key,
      url: `https://media.example.com/${key}`,
      mediaType: MediaType.IMAGE,
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      createdAt: now,
      updatedAt: now,
    }) as Media;

  const makeLink = (
    id: string,
    role: MediaRole,
    sortOrder: number,
  ): MediaLink =>
    ({
      id: `link-${id}`,
      mediaId: id,
      media: makeMedia(id),
      ownerType: MediaOwnerType.PRODUCT,
      ownerId: productId,
      role,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    }) as MediaLink;

  const mediaLinkRepository: jest.Mocked<
    Pick<Repository<MediaLink>, 'count' | 'find'>
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
  };
  const dataSource = {
    transaction: jest.fn((work: (entityManager: EntityManager) => unknown) =>
      work(manager as unknown as EntityManager),
    ),
  };
  const productService = {
    findOne: jest.fn(),
    findOneForManagement: jest.fn(),
  };
  const storageService = {
    createUploadTicket: jest.fn(),
    delete: jest.fn(),
    getObjectMetadata: jest.fn(),
    getPublicUrl: jest.fn(),
  };
  const configService = {
    storage: {
      allowedTypes: ['image/jpeg', 'image/png'],
      maxSizeBytes: 10 * 1024 * 1024,
    },
  };
  const service = new MediaService(
    mediaLinkRepository as unknown as Repository<MediaLink>,
    dataSource as unknown as DataSource,
    productService as unknown as ProductService,
    storageService as unknown as StorageService,
    configService as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    mediaLinkRepository.count.mockResolvedValue(0);
    manager.create.mockImplementation((_entity, input: object) => input);
    manager.findOne.mockResolvedValue(null);
    manager.getRepository.mockReturnValue(mediaLinkRepository);
    dataSource.transaction.mockImplementation((work) =>
      work(manager as unknown as EntityManager),
    );
    storageService.createUploadTicket.mockResolvedValue(ticket);
    storageService.getObjectMetadata.mockResolvedValue({
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    });
    storageService.getPublicUrl.mockReturnValue(ticket.publicUrl);
  });

  it('returns ordered media only after the public product lookup succeeds', async () => {
    const cover = makeLink(mediaId, MediaRole.COVER, 0);
    mediaLinkRepository.find.mockResolvedValueOnce([cover]);

    await expect(service.findAll(productId)).resolves.toEqual([
      expect.objectContaining({ id: mediaId, role: MediaRole.COVER }),
    ]);
    expect(productService.findOne).toHaveBeenCalledWith(productId);
    expect(mediaLinkRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerType: MediaOwnerType.PRODUCT, ownerId: productId },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      }),
    );
  });

  it('creates a short-lived upload ticket for valid image metadata', async () => {
    await expect(
      service.createUploadTicket(productId, userId, {
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      }),
    ).resolves.toEqual(ticket);

    expect(productService.findOneForManagement).toHaveBeenCalledWith(
      productId,
      userId,
    );
    expect(storageService.createUploadTicket).toHaveBeenCalledWith({
      contentType: 'image/jpeg',
      key: expect.stringMatching(
        new RegExp(`^products/${productId}/.+\\.jpg$`),
      ),
      sizeBytes: 1024,
    });
  });

  it('rejects unsupported content before creating an upload ticket', async () => {
    await expect(
      service.createUploadTicket(productId, userId, {
        mimeType: 'text/plain',
        sizeBytes: 4,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storageService.createUploadTicket).not.toHaveBeenCalled();
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
        storageKey,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: mediaId,
        role: MediaRole.COVER,
        sortOrder: 0,
      }),
    );
    expect(storageService.getObjectMetadata).toHaveBeenCalledWith(storageKey);
    expect(manager.create).toHaveBeenLastCalledWith(
      MediaLink,
      expect.objectContaining({ role: MediaRole.COVER, sortOrder: 0 }),
    );
  });

  it('rejects and deletes an object whose stored metadata does not match', async () => {
    storageService.getObjectMetadata.mockResolvedValueOnce({
      contentType: 'image/png',
      sizeBytes: 1024,
    });

    await expect(
      service.confirmUpload(productId, userId, {
        storageKey,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storageService.delete).toHaveBeenCalledWith(storageKey);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('deletes an uploaded object when the product reaches its media limit', async () => {
    manager.count.mockResolvedValueOnce(10);

    await expect(
      service.confirmUpload(productId, userId, {
        storageKey,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storageService.delete).toHaveBeenCalledWith(storageKey);
  });

  it('does not delete an object when the same upload is confirmed twice', async () => {
    manager.findOne.mockResolvedValueOnce({ id: mediaId });

    await expect(
      service.confirmUpload(productId, userId, {
        storageKey,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
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
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('promotes the next image when deleting the current cover', async () => {
    const cover = makeLink(mediaId, MediaRole.COVER, 0);
    const gallery = makeLink(secondMediaId, MediaRole.GALLERY, 1);
    mediaLinkRepository.find.mockResolvedValueOnce([cover, gallery]);
    manager.count.mockResolvedValueOnce(0);

    await expect(
      service.delete(productId, mediaId, userId),
    ).resolves.toBeUndefined();
    expect(manager.remove).toHaveBeenNthCalledWith(1, cover);
    expect(gallery).toEqual(
      expect.objectContaining({ role: MediaRole.COVER, sortOrder: 0 }),
    );
    expect(manager.remove).toHaveBeenNthCalledWith(2, cover.media);
    expect(storageService.delete).toHaveBeenCalledWith(cover.media.storageKey);
  });

  it('rejects setting a cover that is not attached to the product', async () => {
    mediaLinkRepository.find.mockResolvedValueOnce([
      makeLink(mediaId, MediaRole.COVER, 0),
    ]);

    await expect(
      service.setCover(productId, secondMediaId, userId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
