import { DisputeEvidenceService } from '@/modules/dispute/dispute-evidence.service';
import { DisputeEvidence } from '@/modules/dispute/entities/dispute-evidence.entity';

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
      countBy: jest.fn().mockResolvedValue(0),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'e1', ...value })),
    };
    const manager: any = {
      query: jest.fn().mockResolvedValue([{ now: new Date() }]),
      findOne: jest.fn().mockResolvedValue({ id: 'o1' }),
      getRepository: jest.fn((entity) =>
        entity === DisputeEvidence ? repo : null,
      ),
    };
    const db: any = { transaction: async (fn: any) => fn(manager) };
    const access: any = { assertUploadAllowed: jest.fn() };
    const storage: any = { getObjectMetadata: jest.fn() };
    const uploads: any = { verifyMedia: jest.fn().mockResolvedValue(file) };
    const service = new DisputeEvidenceService(db, access, storage, uploads);
    const result = await service.attach('u1', 'o1', {
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
    expect(storage.getObjectMetadata).not.toHaveBeenCalled();
  });
});
