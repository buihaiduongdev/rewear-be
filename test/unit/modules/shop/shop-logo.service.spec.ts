import { BadRequestException } from '@nestjs/common';

import type { DataSource } from 'typeorm';

import type { StorageService } from '@/infrastructure/storage';
import type { ConfigService } from '@/modules/config';
import { ShopLogoService } from '@/modules/shop/shop-logo.service';

const shopId = '9f01c079-83de-4e70-a4fa-6b061d599712';
const key = `shops/${shopId}/logos/8b7d1287-b756-48e6-908e-17e5b6c64f11.png`;
const shop = { id: shopId, logoUrl: null as string | null };
const repository = { findOneByOrFail: jest.fn(), save: jest.fn() };
const storage = {
  createUploadTicket: jest.fn(),
  getObjectMetadata: jest.fn(),
  getPublicUrl: jest.fn(),
};
const db = {
  getRepository: jest.fn(() => repository),
  transaction: jest.fn(),
} as unknown as DataSource;
const config = {
  storage: { allowedTypes: ['image/png'], maxSizeBytes: 10 * 1024 * 1024 },
} as ConfigService;

beforeEach(() => {
  jest.resetAllMocks();
  (db.getRepository as jest.Mock).mockReturnValue(repository);
  (db.transaction as jest.Mock).mockImplementation(async (run) =>
    run({ getRepository: () => repository, query: jest.fn() }),
  );
  shop.logoUrl = null;
  repository.findOneByOrFail.mockResolvedValue(shop);
  repository.save.mockImplementation(async (value) => value);
  storage.getObjectMetadata.mockResolvedValue({
    contentType: 'image/png',
    sizeBytes: 123,
  });
  storage.getPublicUrl.mockReturnValue('https://storage.example/logo.png');
});

it('confirms a verified object and saves its server-generated URL', async () => {
  const service = new ShopLogoService(
    db,
    storage as unknown as StorageService,
    config,
  );
  const result = await service.confirm(shopId, {
    mimeType: 'image/png',
    sizeBytes: 123,
    storageKey: key,
  });
  expect(result.logoUrl).toBe('https://storage.example/logo.png');
  expect(repository.save).toHaveBeenCalledWith(shop);
});

it('rejects a key outside the shop and mismatched uploaded metadata', async () => {
  const service = new ShopLogoService(
    db,
    storage as unknown as StorageService,
    config,
  );
  await expect(
    service.confirm(shopId, {
      mimeType: 'image/png',
      sizeBytes: 123,
      storageKey: key.replace(shopId, 'other-shop'),
    }),
  ).rejects.toBeInstanceOf(BadRequestException);
  storage.getObjectMetadata.mockResolvedValue({
    contentType: 'image/png',
    sizeBytes: 124,
  });
  await expect(
    service.confirm(shopId, {
      mimeType: 'image/png',
      sizeBytes: 123,
      storageKey: key,
    }),
  ).rejects.toBeInstanceOf(BadRequestException);
  expect(repository.save).not.toHaveBeenCalled();
});
