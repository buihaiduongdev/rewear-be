import { DisputeEvidenceService } from '@/modules/dispute/dispute-evidence.service';
import { DisputeEvidence } from '@/modules/dispute/entities/dispute.entity';

describe('DisputeEvidenceService privacy', () => {
  const evidence = {
    id: 'e1',
    orderId: 'o1',
    uploadedById: 'u1',
    storageKey: 'secret',
    mimeType: 'image/jpeg',
    sizeBytes: 12,
    tags: ['ISSUE'],
    status: 'READY',
    eTag: '"v1"',
    readyAt: new Date(),
    uploadExpiresAt: new Date(Date.now() + 60000),
  };
  function setup(row = evidence) {
    const repo = {
      findOneBy: jest.fn().mockResolvedValue(row),
      countBy: jest.fn().mockResolvedValue(0),
      save: jest.fn(async (x) => x),
      create: jest.fn((x) => x),
    };
    const query = {
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    const manager: any = {
      getRepository: jest.fn((type) =>
        type === DisputeEvidence
          ? repo
          : {
              countBy: jest.fn().mockResolvedValue(0),
              createQueryBuilder: jest.fn(() => query),
            },
      ),
      query: jest.fn().mockResolvedValue([{ now: new Date() }]),
    };
    const access: any = {
      assertParty: jest.fn().mockResolvedValue({}),
      assertUploadAllowed: jest.fn().mockResolvedValue({}),
    };
    const storage: any = {
      assertConfigured: jest.fn(),
      createUploadTicket: jest.fn().mockResolvedValue({
        uploadUrl: 'signed-upload',
        method: 'PUT',
        headers: {},
        expiresAt: new Date(),
      }),
      createDownloadUrl: jest.fn().mockResolvedValue({ url: 'signed' }),
      getObjectMetadata: jest.fn().mockResolvedValue({
        eTag: '"v1"',
        contentType: 'image/jpeg',
        sizeBytes: 12,
      }),
    };
    const db: any = { manager, transaction: async (fn: any) => fn(manager) };
    return {
      service: new DisputeEvidenceService(db, access, storage),
      repo,
      manager,
      storage,
      access,
    };
  }
  it('creates a server-bound ticket without exposing private keys', async () => {
    const { service, repo, storage, manager } = setup();
    const result = await service.createUpload('u1', 'o1', {
      mimeType: 'image/jpeg',
      sizeBytes: 12,
      tags: ['ISSUE'],
    });
    expect(result).not.toHaveProperty('storageKey');
    expect(result).not.toHaveProperty('publicUrl');
    expect(result.uploadUrl).toBe('signed-upload');
    expect(repo.save.mock.calls[0][0]).toMatchObject({
      orderId: 'o1',
      uploadedById: 'u1',
      status: 'UPLOADING',
    });
    expect(manager.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(storage.createUploadTicket).toHaveBeenCalled();
  });
  it('enforces lifetime upload cap', async () => {
    const { service, repo, storage } = setup();
    repo.countBy.mockResolvedValue(30);
    await expect(
      service.createUpload('u1', 'o1', {
        mimeType: 'image/jpeg',
        sizeBytes: 12,
        tags: ['ISSUE'],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(storage.createUploadTicket).not.toHaveBeenCalled();
  });
  it('lets admin read only ready evidence', async () => {
    const { service } = setup({ ...evidence, status: 'UPLOADING' });
    await expect(service.adminDownload('e1')).rejects.toMatchObject({
      status: 400,
    });
  });
  it('lets uploader read private ready evidence using confirmed version', async () => {
    const { service, storage } = setup();
    await expect(service.download('u1', 'e1')).resolves.toEqual({
      url: 'signed',
    });
    expect(storage.createDownloadUrl).toHaveBeenCalledWith('secret', '"v1"');
  });
  it('denies other party access to unsubmitted evidence', async () => {
    const { service, storage } = setup();
    await expect(service.download('u2', 'e1')).rejects.toMatchObject({
      status: 403,
    });
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
  it('denies confirmation by another uploader', async () => {
    const { service, storage } = setup();
    await expect(service.confirm('u2', 'e1')).rejects.toMatchObject({
      status: 403,
    });
    expect(storage.getObjectMetadata).not.toHaveBeenCalled();
  });
  it('rejects mismatched HEAD metadata', async () => {
    const { service, storage } = setup({ ...evidence, status: 'UPLOADING' });
    storage.getObjectMetadata.mockResolvedValue({
      eTag: '"v1"',
      contentType: 'image/jpeg',
      sizeBytes: 13,
    });
    await expect(service.confirm('u1', 'e1')).rejects.toMatchObject({
      status: 400,
    });
  });
  it('returns only safe metadata on ready confirmation replay', async () => {
    const { service, storage } = setup();
    const result = await service.confirm('u1', 'e1');
    expect(result).not.toHaveProperty('storageKey');
    expect(storage.getObjectMetadata).not.toHaveBeenCalled();
  });
  it('rechecks upload eligibility under the lock before confirming', async () => {
    const { service, access, repo } = setup({
      ...evidence,
      status: 'UPLOADING',
    });
    access.assertUploadAllowed.mockRejectedValue(new Error('window closed'));
    await expect(service.confirm('u1', 'e1')).rejects.toThrow('window closed');
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('rejects expired tickets after reading object metadata', async () => {
    const { service } = setup({
      ...evidence,
      status: 'UPLOADING',
      uploadExpiresAt: new Date(0),
    });
    await expect(service.confirm('u1', 'e1')).rejects.toMatchObject({
      status: 400,
    });
  });
  it('records confirmed metadata without exposing its object key', async () => {
    const { service, repo } = setup({ ...evidence, status: 'UPLOADING' });
    const result = await service.confirm('u1', 'e1');
    expect(result.status).toBe('READY');
    expect(result.readyAt).toBeInstanceOf(Date);
    expect(result).not.toHaveProperty('eTag');
    expect(repo.save.mock.calls[0][0].eTag).toBe('"v1"');
  });
  it('denies callers without access to the evidence order', async () => {
    const { service, access, storage } = setup();
    access.assertParty.mockRejectedValue(new Error('not a party'));
    await expect(service.download('stranger', 'e1')).rejects.toThrow(
      'not a party',
    );
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
  it('does not reserve a ticket when private storage is unavailable', async () => {
    const { service, storage, repo } = setup();
    storage.assertConfigured.mockImplementation(() => {
      throw new Error('private bucket missing');
    });
    await expect(
      service.createUpload('u1', 'o1', {
        mimeType: 'image/jpeg',
        sizeBytes: 12,
        tags: ['ISSUE'],
      }),
    ).rejects.toThrow('private bucket missing');
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('validates upload size before reserving a ticket', async () => {
    const { service, repo } = setup();
    await expect(
      service.createUpload('u1', 'o1', {
        mimeType: 'image/jpeg',
        sizeBytes: 100000000,
        tags: ['ISSUE'],
      }),
    ).rejects.toBeDefined();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
