import { R2StorageService } from '@/infrastructure/storage/provider/r2/r2-storage.service';
import type { ConfigService } from '@/modules/config';

describe('R2 storage buckets', () => {
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
  it.each([undefined, 'public-media'])(
    'rejects missing or public private bucket %s',
    async (bucket) => {
      await expect(
        new R2StorageService(config(bucket)).createUploadTicket(
          {
            keyPrefix: 'test',
            extension: 'jpg',
            contentType: 'image/jpeg',
            sizeBytes: 12,
          },
          'private',
        ),
      ).rejects.toMatchObject({ status: 503 });
    },
  );
  it('signs equivalent uploads for both buckets', async () => {
    const service = new R2StorageService(config('private-media'));
    const input = {
      keyPrefix: 'uploads/test',
      extension: 'jpg',
      contentType: 'image/jpeg',
      sizeBytes: 12,
    };
    const [publicTicket, privateTicket] = await Promise.all([
      service.createUploadTicket(input, 'public'),
      service.createUploadTicket(input, 'private'),
    ]);
    expect(privateTicket.headers).toEqual(publicTicket.headers);
    expect(privateTicket.method).toBe(publicTicket.method);
    const publicUrl = new URL(publicTicket.uploadUrl);
    const privateUrl = new URL(privateTicket.uploadUrl);
    expect(publicUrl.hostname).toContain('public-media');
    expect(privateUrl.hostname).toContain('private-media');
    expect(publicUrl.pathname).toMatch(/^\/uploads\/test\/.+\.jpg$/);
    expect(privateUrl.pathname).toMatch(/^\/uploads\/test\/.+\.jpg$/);
    expect(privateUrl.searchParams.get('X-Amz-SignedHeaders')).toBe(
      publicUrl.searchParams.get('X-Amz-SignedHeaders'),
    );
    expect(publicUrl.searchParams.get('X-Amz-SignedHeaders')).toContain(
      'if-none-match',
    );
  });
  it('creates a directly usable private download URL', async () => {
    const ticket = await new R2StorageService(
      config('private-media'),
    ).createDownloadUrl('evidence/test');
    expect(ticket.headers).toEqual({});
    expect(new URL(ticket.url).searchParams.get('X-Amz-SignedHeaders')).toBe(
      'host',
    );
  });
});
