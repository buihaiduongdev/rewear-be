import { BadRequestException } from '@nestjs/common';

import type { IStorageProvider } from '@/infrastructure/storage/storage.interface';
import { StorageService } from '@/infrastructure/storage/storage.service';

const provider = { createUploadTicket: jest.fn() };
const service = new StorageService(provider as unknown as IStorageProvider);
beforeEach(() => jest.clearAllMocks());

it.each(['public', 'private'] as const)(
  'validates and normalizes %s uploads identically',
  (visibility) => {
    service.createUploadTicket(
      {
        keyPrefix: 'uploads/test',
        extension: 'jpg',
        contentType: 'IMAGE/JPEG',
        sizeBytes: 42,
      },
      visibility,
    );
    expect(provider.createUploadTicket).toHaveBeenCalledWith(
      {
        keyPrefix: 'uploads/test',
        extension: 'jpg',
        contentType: 'image/jpeg',
        sizeBytes: 42,
      },
      visibility,
    );
    expect(() =>
      service.createUploadTicket(
        {
          keyPrefix: 'uploads/test',
          extension: 'jpg',
          contentType: 'image/jpeg',
          sizeBytes: 0,
        },
        visibility,
      ),
    ).toThrow(BadRequestException);
  },
);
