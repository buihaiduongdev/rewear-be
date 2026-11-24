import { NotFoundException } from '@nestjs/common';

import type { EntityManager, Repository } from 'typeorm';

import type { StorageService } from '@/infrastructure/storage';
import { Media } from '@/modules/media/entities';
import { MediaService } from '@/modules/media/media.service';

const userId = '2f5c7c7d-5c29-482e-a530-f8395aac84d0';
const prefix = 'products/7ed3a06a-81ae-44e9-9d57-6ef1c831df75';
const key = `${prefix}/39053617-385b-4921-b81c-54fba5c56453.jpg`;
const pending = {
  storageKey: key,
  uploadedById: userId,
  visibility: 'public',
  mimeType: 'image/jpeg',
  sizeBytes: 42,
  isAttached: false,
  retiredAt: null,
};
const repository = {
  create: jest.fn((value: object) => value),
  save: jest.fn(async (value: object) => value),
};
const storage = { createUploadTicket: jest.fn(), getPublicUrl: jest.fn() };
const manager = {
  findOne: jest.fn(),
  save: jest.fn(async (value: object) => value),
};
const service = new MediaService(
  repository as unknown as Repository<Media>,
  storage as unknown as StorageService,
);

beforeEach(() => {
  jest.clearAllMocks();
  manager.findOne.mockResolvedValue({ ...pending });
  storage.getPublicUrl.mockReturnValue('https://example.test/image.jpg');
  storage.createUploadTicket.mockResolvedValue({ storageKey: key });
});

it('records a pending upload ticket owned by the user', async () => {
  await service.createUploadTicket(userId, {
    mimeType: 'image/jpeg',
    sizeBytes: 42,
  });
  expect(repository.save).toHaveBeenCalledWith(
    expect.objectContaining({
      uploadedById: userId,
      isAttached: false,
      sizeBytes: 42,
    }),
  );
});

it('attaches a pending ticket without reading the object', async () => {
  await service.verifyMedia(
    manager as unknown as EntityManager,
    userId,
    'media-id',
  );
  expect(manager.save).toHaveBeenCalledWith(
    expect.objectContaining({ isAttached: true }),
  );
});

it('rejects another user and retired tickets', async () => {
  await expect(
    service.verifyMedia(
      manager as unknown as EntityManager,
      'another-user',
      'media-id',
    ),
  ).rejects.toBeInstanceOf(NotFoundException);
  manager.findOne.mockResolvedValueOnce({ ...pending, retiredAt: new Date() });
  await expect(
    service.verifyMedia(
      manager as unknown as EntityManager,
      userId,
      'media-id',
    ),
  ).rejects.toBeInstanceOf(NotFoundException);
});
