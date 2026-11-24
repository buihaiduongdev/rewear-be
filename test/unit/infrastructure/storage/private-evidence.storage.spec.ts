import { R2StorageService } from '@/infrastructure/storage/provider/r2/r2-storage.service';
import type { ConfigService } from '@/modules/config';

describe('R2StorageService', () => {
  const config = (privateBucket?: string) =>
    ({
      storage: {
        privateBucket,
        bucket: 'public-media',
        region: 'auto',
        endpoint: 'https://example.r2.cloudflarestorage.com',
        accessKeyId: 'test',
        secretAccessKey: 'secret',
        uploadExpiresInSeconds: 900,
      },
    }) as ConfigService;
  it.each([undefined, 'public-media', 'bad/bucket'])(
    'fails closed for invalid private bucket %s',
    async (bucket) => {
      await expect(
        new R2StorageService(config(bucket)).createUploadTicket(
          {
            key: 'evidence/test',
            contentType: 'image/jpeg',
            sizeBytes: 12,
          },
          'private',
        ),
      ).rejects.toMatchObject({ status: 503 });
    },
  );
  it('signs immutable uploads with exact metadata and no public URL', async () => {
    const ticket = await new R2StorageService(
      config('private-evidence'),
    ).createUploadTicket(
      {
        key: 'evidence/test',
        contentType: 'image/jpeg',
        sizeBytes: 12,
      },
      'private',
    );
    expect(ticket).not.toHaveProperty('publicUrl');
    expect(ticket.headers).not.toHaveProperty('Content-Length');
    expect(ticket.headers).toEqual({
      'Content-Type': 'image/jpeg',
      'If-None-Match': '*',
    });
    const headers = new URL(ticket.uploadUrl).searchParams
      .get('X-Amz-SignedHeaders')
      ?.split(';');
    expect(headers).toEqual(
      expect.arrayContaining([
        'if-none-match',
        'content-type',
        'content-length',
      ]),
    );
  });
  it('creates a directly usable private download URL', async () => {
    const ticket = await new R2StorageService(
      config('private-evidence'),
    ).createDownloadUrl('evidence/test');
    expect(ticket.headers).toEqual({});
    expect(new URL(ticket.url).searchParams.get('X-Amz-SignedHeaders')).toBe(
      'host',
    );
  });
  it('reads provider metadata without creating a public URL', async () => {
    const service = new R2StorageService(config('private-evidence'));
    (service as any).client.send = jest.fn().mockResolvedValue({
      ETag: '"v1"',
      ContentType: 'video/mp4',
      ContentLength: 42,
    });
    await expect(
      service.getObjectMetadata('evidence/test', 'private'),
    ).resolves.toEqual({
      eTag: '"v1"',
      contentType: 'video/mp4',
      sizeBytes: 42,
    });
  });
  it('maps provider HEAD failure to unavailable', async () => {
    const service = new R2StorageService(config('private-evidence'));
    (service as any).client.send = jest
      .fn()
      .mockRejectedValue(new Error('unavailable'));
    await expect(
      service.getObjectMetadata('evidence/test', 'private'),
    ).rejects.toMatchObject({ status: 503 });
  });
});
