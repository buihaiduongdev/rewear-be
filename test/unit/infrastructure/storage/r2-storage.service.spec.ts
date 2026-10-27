import { R2StorageService } from '@/infrastructure/storage/provider/r2/r2-storage.service';
import type { ConfigService } from '@/modules/config';

describe('R2 upload immutability', () => {
  it('signs the create-once condition so a ticket cannot overwrite confirmed evidence', async () => {
    const service = new R2StorageService({
      storage: {
        region: 'auto',
        endpoint: 'https://example.r2.cloudflarestorage.com',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        bucket: 'test-bucket',
        publicBaseUrl: 'https://media.example.com',
        uploadExpiresInSeconds: 900,
      },
    } as ConfigService);
    const ticket = await service.createUploadTicket({
      key: 'products/test/image.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    });
    expect(ticket.headers['If-None-Match']).toBe('*');
    const url = new URL(ticket.uploadUrl);
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toContain(
      'if-none-match',
    );
  });
});
