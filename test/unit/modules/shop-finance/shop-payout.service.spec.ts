import { Media } from '@/modules/media/entities';
import { MediaType } from '@/modules/media/enums';
import { PAYOUT_STATUS } from '@/modules/shop-finance/constants/payout.constant';
import { ShopPayout } from '@/modules/shop-finance/entities';
import { ShopPayoutService } from '@/modules/shop-finance/shop-payout.service';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const PAYOUT_ID = '11111111-1111-4111-8111-111111111111';
const MEDIA_ID = '22222222-2222-4222-8222-222222222222';

describe('payout service authorization and UNC receipt attachment', () => {
  it('denies former owners before returning private bank data', async () => {
    const manager = {
      findOneBy: async () => null,
    };
    const db = { manager };
    const service = new ShopPayoutService(
      db as never,
      {} as never,
      {} as never,
    );
    await expect(service.ownerView('former', 'shop')).rejects.toThrow(
      'Current active Shop Owner required',
    );
  });

  it('creates a private receipt upload ticket for active admins', async () => {
    const manager = {
      findOneBy: jest.fn(
        async (entity: unknown, where: Record<string, unknown>) =>
          entity === User && where.id === ADMIN_ID
            ? { id: ADMIN_ID, role: UserRole.ADMIN, status: UserStatus.ACTIVE }
            : null,
      ),
    };
    const mediaService = {
      createUploadTicket: jest.fn().mockResolvedValue({
        mediaId: MEDIA_ID,
        uploadUrl: 'https://r2.example/upload-unc',
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
      }),
    };
    const service = new ShopPayoutService(
      { manager } as never,
      mediaService as never,
      {} as never,
    );

    const ticket = await service.createReceiptUploadTicket(ADMIN_ID, {
      mimeType: 'image/png',
      sizeBytes: 120_000,
    });
    expect(mediaService.createUploadTicket).toHaveBeenCalledWith(ADMIN_ID, {
      mimeType: 'image/png',
      sizeBytes: 120_000,
      visibility: 'private',
    });
    expect(ticket.id).toBe(MEDIA_ID);
  });

  it('attaches verified UNC image receipt on succeed and keeps text-only evidence backward-compatible', async () => {
    const now = new Date('2026-11-26T10:00:00.000Z');
    const payout: Partial<ShopPayout> = {
      id: PAYOUT_ID,
      shopId: '33333333-3333-4333-8333-333333333333',
      ownerId: '44444444-4444-4444-8444-444444444444',
      status: PAYOUT_STATUS.PROCESSING,
      amount: 500000,
      recipientSnapshot: {
        bankCode: 'VCB',
        accountNumber: '0123456789',
        accountName: 'SHOP OWNER',
      },
      bankReference: null,
      bankTransferredAt: null,
      transferEvidence: null,
      transferEvidenceMediaId: null,
    };
    const media: Partial<Media> = {
      id: MEDIA_ID,
      storageKey: 'uploads/admin/unc-receipt.png',
      visibility: 'private',
      mediaType: MediaType.IMAGE,
      retiredAt: null,
    };

    const manager = {
      query: jest.fn(async () => [{ now }]),
      findOneBy: jest.fn(
        async (entity: unknown, where: Record<string, unknown>) => {
          if (entity === User && where.id === ADMIN_ID) {
            return {
              id: ADMIN_ID,
              role: UserRole.ADMIN,
              status: UserStatus.ACTIVE,
            };
          }
          if (entity === ShopPayout && where.id === PAYOUT_ID) return payout;
          if (entity === Media && where.id === MEDIA_ID) return media;
          return null;
        },
      ),
      findOneOrFail: jest.fn(
        async (
          _entity: unknown,
          opts?: { relations?: Record<string, boolean> },
        ) =>
          opts?.relations?.transferEvidenceMedia
            ? { ...payout, transferEvidenceMedia: media }
            : payout,
      ),
      save: jest.fn(async (value: unknown) => value),
    };
    const db = {
      manager,
      transaction: jest.fn(async (fn: (mgr: typeof manager) => unknown) =>
        fn(manager),
      ),
    };
    const mediaService = {
      verifyMedia: jest.fn().mockResolvedValue(media),
    };
    const storageService = {
      createDownloadUrl: jest.fn().mockResolvedValue({
        url: 'https://r2.example/signed/unc-receipt.png',
        headers: {},
        expiresAt: new Date('2026-11-26T10:15:00.000Z'),
      }),
    };

    const service = new ShopPayoutService(
      db as never,
      mediaService as never,
      storageService as never,
    );

    const payload = {
      bankCode: 'VCB',
      accountNumber: '0123456789',
      accountName: 'SHOP OWNER',
      amount: 500000,
      bankReference: 'UNC-20261126-88',
      transferredAt: '2026-11-26T09:50:00.000Z',
      evidence: 'Transferred via VCB UNC',
      transferEvidenceMediaId: MEDIA_ID,
    };

    const succeeded = await service.succeed(ADMIN_ID, PAYOUT_ID, payload);
    expect(mediaService.verifyMedia).toHaveBeenCalledWith(
      manager,
      ADMIN_ID,
      MEDIA_ID,
      undefined,
      'private',
    );
    expect(succeeded.status).toBe(PAYOUT_STATUS.SUCCEEDED);
    expect(succeeded.transferEvidence).toBe('Transferred via VCB UNC');
    expect(succeeded.transferEvidenceMediaId).toBe(MEDIA_ID);
    expect(succeeded.transferEvidenceUrl).toBe(
      'https://r2.example/signed/unc-receipt.png',
    );

    // Idempotent replay with same receipt succeeds without re-verifying media
    const replayed = await service.succeed(ADMIN_ID, PAYOUT_ID, payload);
    expect(mediaService.verifyMedia).toHaveBeenCalledTimes(1);
    expect(replayed.transferEvidenceMediaId).toBe(MEDIA_ID);

    // Conflicting receipt media ID on replay is rejected
    await expect(
      service.succeed(ADMIN_ID, PAYOUT_ID, {
        ...payload,
        transferEvidenceMediaId: undefined,
      }),
    ).rejects.toThrow('Conflicting bank result');

    // Admin receipt download returns signed URL
    const download = await service.getReceiptDownload(ADMIN_ID, PAYOUT_ID);
    expect(download.mediaId).toBe(MEDIA_ID);
    expect(download.url).toBe('https://r2.example/signed/unc-receipt.png');
  });

  it('rejects non-image media when attaching a payout receipt', async () => {
    const now = new Date('2026-11-26T10:00:00.000Z');
    const payout: Partial<ShopPayout> = {
      id: PAYOUT_ID,
      status: PAYOUT_STATUS.PROCESSING,
      amount: 100000,
      recipientSnapshot: {
        bankCode: 'VCB',
        accountNumber: '0123456789',
        accountName: 'SHOP OWNER',
      },
    };
    const manager = {
      query: jest.fn(async () => [{ now }]),
      findOneBy: jest.fn(async () => ({
        id: ADMIN_ID,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      })),
      findOneOrFail: jest.fn(async () => payout),
      save: jest.fn(async (v: unknown) => v),
    };
    const db = {
      manager,
      transaction: jest.fn(async (fn: (mgr: typeof manager) => unknown) =>
        fn(manager),
      ),
    };
    const mediaService = {
      verifyMedia: jest.fn().mockResolvedValue({
        id: MEDIA_ID,
        mediaType: MediaType.VIDEO,
        visibility: 'private',
      }),
    };
    const service = new ShopPayoutService(
      db as never,
      mediaService as never,
      {} as never,
    );

    await expect(
      service.succeed(ADMIN_ID, PAYOUT_ID, {
        bankCode: 'VCB',
        accountNumber: '0123456789',
        accountName: 'SHOP OWNER',
        amount: 100000,
        bankReference: 'UNC-1',
        transferredAt: '2026-11-26T09:50:00.000Z',
        evidence: 'UNC note',
        transferEvidenceMediaId: MEDIA_ID,
      }),
    ).rejects.toThrow('Payout UNC receipt must be an image file');
  });
});
