import { DisputeService } from '@/modules/dispute/dispute.service';
import { DisputeCase } from '@/modules/dispute/entities/dispute-case.entity';
import { DisputeEvidence } from '@/modules/dispute/entities/dispute-evidence.entity';
import { DisputeIssue } from '@/modules/dispute/entities/dispute-issue.entity';

describe('dispute evidence shared media', () => {
  it('attaches owned private media without a storage HEAD request', async () => {
    const mediaId = '00000000-0000-4000-8000-000000000001';
    const file = {
      id: mediaId,
      mimeType: 'image/jpeg',
      sizeBytes: 12,
      storageKey: 'secret',
      retiredAt: null,
    };
    const repo = {
      findOneBy: jest.fn().mockResolvedValue(null),
      countBy: jest.fn().mockResolvedValue(0),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({
        id: 'e1',
        ...value,
      })),
    };
    const manager = {
      query: jest.fn().mockResolvedValue([{ now: new Date() }]),
      findOneOrFail: jest.fn().mockResolvedValue({ id: 'o1', buyerId: 'u1' }),
      findOneBy: jest.fn(async (entity: unknown) =>
        entity === DisputeCase ? { id: 'c1', orderId: 'o1' } : null,
      ),
      find: jest.fn(async (entity: unknown) =>
        entity === DisputeIssue ? [{ id: 'i1', status: 'ACTIVE' }] : [],
      ),
      existsBy: jest.fn().mockResolvedValue(false),
      getRepository: jest.fn((entity: unknown) =>
        entity === DisputeEvidence ? repo : null,
      ),
    };
    const db = {
      transaction: async (fn: (m: typeof manager) => Promise<unknown>) =>
        fn(manager),
    };
    const storageService = { getObjectMetadata: jest.fn() };
    const mediaService = { verifyMedia: jest.fn().mockResolvedValue(file) };
    const service = new DisputeService(
      db as never,
      storageService as never,
      mediaService as never,
      { record: jest.fn() } as never,
    );
    const result = await service.attachEvidence('u1', 'o1', {
      mediaId,
      tags: ['ISSUE'],
    });
    expect(result).toMatchObject({
      id: 'e1',
      mimeType: 'image/jpeg',
      sizeBytes: 12,
    });
    expect(result).not.toHaveProperty('storageKey');
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ mediaId }),
    );
    expect(storageService.getObjectMetadata).not.toHaveBeenCalled();
  });
});
