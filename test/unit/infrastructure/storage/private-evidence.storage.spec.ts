import { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';
import type { ConfigService } from '@/modules/config';

describe('PrivateEvidenceStorage', () => {
  const config = (privateBucket?: string) =>
    ({
      storage: {
        privateBucket,
        bucket: 'public-media',
        region: 'auto',
        endpoint: 'https://example.r2.cloudflarestorage.com',
        accessKeyId: 'test',
        secretAccessKey: 'secret',
      },
    }) as ConfigService;
  it.each([undefined, 'public-media', 'bad/bucket'])(
    'fails closed for invalid private bucket %s',
    async (bucket) => {
      await expect(
        new PrivateEvidenceStorage(config(bucket)).createUploadTicket({
          key: 'evidence/test',
          contentType: 'image/jpeg',
          sizeBytes: 12,
        }),
      ).rejects.toMatchObject({ status: 503 });
    },
  );
  it('signs immutable uploads with exact metadata and no public URL', async () => {
    const ticket = await new PrivateEvidenceStorage(
      config('private-evidence'),
    ).createUploadTicket({
      key: 'evidence/test',
      contentType: 'image/jpeg',
      sizeBytes: 12,
    });
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
  it('binds downloads to confirmed ETag', async () => {
    const ticket = await new PrivateEvidenceStorage(
      config('private-evidence'),
    ).createDownloadUrl('evidence/test', '"version1"');
    expect(
      new URL(ticket.url).searchParams.get('X-Amz-SignedHeaders')?.split(';'),
    ).toContain('if-match');
    expect(ticket.headers).toEqual({ 'If-Match': '"version1"' });
  });
  it('reads provider metadata without creating a public URL', async () => {
    const service = new PrivateEvidenceStorage(config('private-evidence'));
    (service as any).client.send = jest.fn().mockResolvedValue({
      ETag: '"v1"',
      ContentType: 'video/mp4',
      ContentLength: 42,
    });
    await expect(service.getObjectMetadata('evidence/test')).resolves.toEqual({
      eTag: '"v1"',
      contentType: 'video/mp4',
      sizeBytes: 42,
    });
  });
  it('maps provider HEAD failure to unavailable', async () => {
    const service = new PrivateEvidenceStorage(config('private-evidence'));
    (service as any).client.send = jest
      .fn()
      .mockRejectedValue(new Error('unavailable'));
    await expect(
      service.getObjectMetadata('evidence/test'),
    ).rejects.toMatchObject({ status: 503 });
  });
});
