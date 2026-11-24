import { BadRequestException } from '@nestjs/common';

import type { IStorageProvider } from '@/infrastructure/storage/storage.interface';
import { StorageService } from '@/infrastructure/storage/storage.service';
import type { ConfigService } from '@/modules/config';

const provider = { createUploadTicket: jest.fn() };
const config = {
  storage: { allowedTypes: ['image/jpeg'], maxSizeBytes: 1000 },
};
const service = new StorageService(
  provider as unknown as IStorageProvider,
  config as unknown as ConfigService,
);

beforeEach(() => jest.clearAllMocks());

it('normalizes allowed content types before issuing a ticket', async () => {
  await service.createUploadTicket({
    key: 'uploads/test',
    contentType: 'IMAGE/JPEG',
    sizeBytes: 42,
  });
  expect(provider.createUploadTicket).toHaveBeenCalledWith(
    { key: 'uploads/test', contentType: 'image/jpeg', sizeBytes: 42 },
    'public',
  );
});

it.each([
  { contentType: 'image/png', sizeBytes: 42 },
  { contentType: 'image/jpeg', sizeBytes: 0 },
  { contentType: 'image/jpeg', sizeBytes: 1001 },
])('rejects invalid file type or size', (file) => {
  expect(() =>
    service.createUploadTicket({ key: 'uploads/test', ...file }),
  ).toThrow(BadRequestException);
  expect(provider.createUploadTicket).not.toHaveBeenCalled();
});
