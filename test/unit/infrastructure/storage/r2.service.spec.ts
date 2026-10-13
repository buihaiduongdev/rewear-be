import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { R2Service } from '@/infrastructure/storage/provider/r2/r2.service';
import type { ICreateUploadTicketInput } from '@/infrastructure/storage/storage.interface';
import type { ConfigService } from '@/modules/config/config.service';
import type { TStorageConfig } from '@/modules/config/schemas';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('R2Service', () => {
  const client = {} as S3Client;
  const command = {} as PutObjectCommand;
  const input: ICreateUploadTicketInput = {
    fileName: 'Jacket.JPG',
    mime: 'image/jpeg',
    size: 1024,
  };
  let storage: TStorageConfig;
  let service: R2Service;

  beforeEach(() => {
    jest.resetAllMocks();
    storage = {
      region: 'auto',
      endpoint: 'https://account.r2.cloudflarestorage.com',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret',
      bucket: 'rewear-test',
      publicBaseUrl: 'https://media.example.com/',
      expiresIn: 900,
    };
    jest.mocked(S3Client).mockImplementation(() => client);
    jest.mocked(PutObjectCommand).mockImplementation(() => command);
    jest
      .mocked(getSignedUrl)
      .mockResolvedValue('https://signed.example/upload');
    service = new R2Service({ storage } as ConfigService);
  });

  it('configures the S3 client for the R2 endpoint', () => {
    expect(S3Client).toHaveBeenCalledWith({
      region: storage.region,
      endpoint: storage.endpoint,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  });

  it('returns a PUT ticket with matching object metadata and public URL', async () => {
    const ticket = await service.createUploadTicket(input);

    expect(ticket.key).toMatch(/^uploads\/[0-9a-f-]{36}\.jpg$/);
    expect(ticket).toEqual({
      key: ticket.key,
      uploadUrl: 'https://signed.example/upload',
      publicUrl: `https://media.example.com/${ticket.key}`,
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
    });
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: storage.bucket,
      Key: ticket.key,
      ContentType: input.mime,
      ContentLength: input.size,
    });
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
    expect(getSignedUrl).toHaveBeenCalledWith(client, command, {
      expiresIn: 900,
    });
  });

  it('normalizes surrounding slashes in a custom prefix', async () => {
    const ticket = await service.createUploadTicket({
      ...input,
      keyPrefix: '/shops/shop-id/gallery///',
    });

    expect(ticket.key).toMatch(/^shops\/shop-id\/gallery\/[0-9a-f-]{36}\.jpg$/);
    expect(ticket.publicUrl).toBe(`https://media.example.com/${ticket.key}`);
  });

  it('supports a file without an extension and a base URL without a slash', async () => {
    storage.publicBaseUrl = 'https://media.example.com';
    const ticket = await service.createUploadTicket({
      ...input,
      fileName: 'image',
    });

    expect(ticket.key).toMatch(/^uploads\/[0-9a-f-]{36}$/);
    expect(ticket.publicUrl).toBe(`https://media.example.com/${ticket.key}`);
  });

  it('creates distinct keys for repeated uploads of the same file', async () => {
    const first = await service.createUploadTicket(input);
    const second = await service.createUploadTicket(input);

    expect(first.key).not.toBe(second.key);
  });

  it('propagates an error when signing fails', async () => {
    const error = new Error('Unable to sign upload');
    jest.mocked(getSignedUrl).mockRejectedValueOnce(error);

    await expect(service.createUploadTicket(input)).rejects.toBe(error);
  });
});
