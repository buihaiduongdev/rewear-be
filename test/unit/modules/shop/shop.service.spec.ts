import { ConflictException, ForbiddenException } from '@nestjs/common';

import { EntityNotFoundError, QueryFailedError } from 'typeorm';
import type { DataSource, EntityManager, Repository } from 'typeorm';

import { Media } from '@/modules/media/entities';
import { SHOP_APPLICATION_STATE } from '@/modules/shop/applications/constants/shop-application.constant';
import { ShopApplication } from '@/modules/shop/applications/entities';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole, ShopStatus } from '@/modules/shop/enums';
import { ShopService } from '@/modules/shop/shop.service';
import { User } from '@/modules/user/entities';

describe('ShopService', () => {
  const ownerId = 'eb9ab2f0-97dd-456c-809f-75831b227895';
  const shop: Shop = {
    id: 'f844ab9a-6f7a-4495-bc34-064bf3bf32d5',
    name: 'Re.wear Closet',
    description: null,
    logoMediaId: null,
    logoMedia: null,
    onboardingRequired: false,
    approvedAt: null,
    status: ShopStatus.ACTIVE,
    members: [],
    createdAt: new Date('2026-10-18T00:00:00.000Z'),
    updatedAt: new Date('2026-10-18T00:00:00.000Z'),
  };
  const ownerMembership: ShopMember = {
    id: 'a2192cf2-d737-4d70-ae0b-ea30399453e7',
    shopId: shop.id,
    shop,
    userId: ownerId,
    user: { id: ownerId } as User,
    memberRole: ShopMemberRole.OWNER,
    joinedAt: new Date('2026-10-18T00:00:00.000Z'),
    createdAt: new Date('2026-10-18T00:00:00.000Z'),
    updatedAt: new Date('2026-10-18T00:00:00.000Z'),
  };

  const shopRepository: jest.Mocked<
    Pick<
      Repository<Shop>,
      | 'find'
      | 'findOne'
      | 'findOneOrFail'
      | 'findOneBy'
      | 'findOneByOrFail'
      | 'save'
      | 'merge'
    >
  > = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    findOneBy: jest.fn(),
    findOneByOrFail: jest.fn(),
    save: jest.fn(),
    merge: jest.fn(),
  };
  const memberRepository: jest.Mocked<
    Pick<
      Repository<ShopMember>,
      | 'find'
      | 'findOneOrFail'
      | 'findOneBy'
      | 'findOneByOrFail'
      | 'create'
      | 'save'
    >
  > = {
    find: jest.fn(),
    findOneOrFail: jest.fn(),
    findOneBy: jest.fn(),
    findOneByOrFail: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const entityManager = {
    query: jest.fn(),
    existsBy: jest.fn(),
    update: jest.fn(),
    findOneOrFail: jest.fn(),
    findOneBy: jest.fn(),
    findOneByOrFail: jest.fn(),
    getRepository: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(),
  };
  const uploads = { verifyMedia: jest.fn() };
  const service = new ShopService(
    shopRepository as unknown as Repository<Shop>,
    memberRepository as unknown as Repository<ShopMember>,
    dataSource as unknown as DataSource,
    { initializeDefaultRoles: jest.fn() } as never,
    uploads as never,
    { getPublicUrl: (key: string) => `https://public.test/${key}` } as never,
    { record: jest.fn() } as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    entityManager.getRepository.mockReturnValue(shopRepository);
    entityManager.existsBy.mockResolvedValue(false);
    dataSource.transaction.mockImplementation(
      async (run: (manager: EntityManager) => Promise<unknown>) =>
        run(entityManager as unknown as EntityManager),
    );
    shopRepository.merge.mockImplementation((entity, ...sources) => {
      for (const source of sources) {
        Object.assign(
          entity,
          Object.fromEntries(
            Object.entries(source).filter(([, value]) => value !== undefined),
          ),
        );
      }
      return entity;
    });
  });

  it('lists only active shops in newest-first order', async () => {
    shopRepository.find.mockResolvedValueOnce([shop]);

    await expect(service.findAll()).resolves.toEqual([
      { ...shop, logoUrl: null, identitySalesPaused: false },
    ]);
    expect(shopRepository.find).toHaveBeenCalledWith({
      where: { status: ShopStatus.ACTIVE },
      order: { createdAt: 'DESC' },
      relations: { logoMedia: true },
    });
  });

  it('attaches the uploaded logo in the shop transaction', async () => {
    const logoMediaId = '0b8b4a7c-5a28-4ee3-90f6-62ba3c8f56c6';
    const newShop = { ...shop, logoMediaId };
    uploads.verifyMedia.mockResolvedValueOnce({
      id: logoMediaId,
      storageKey: 'logo.jpg',
      mediaType: 'IMAGE',
      retiredAt: null,
    });
    entityManager.create
      .mockReturnValueOnce(newShop)
      .mockReturnValueOnce(ownerMembership);
    entityManager.save
      .mockResolvedValueOnce(newShop)
      .mockResolvedValueOnce(ownerMembership);

    await service.create(ownerId, { name: shop.name, logoMediaId });

    expect(uploads.verifyMedia).toHaveBeenCalledWith(
      entityManager,
      ownerId,
      logoMediaId,
      5 * 1024 * 1024,
    );
    expect(entityManager.create).toHaveBeenNthCalledWith(
      1,
      Shop,
      expect.objectContaining({ logoMediaId }),
    );
  });

  it('does not expose an inactive shop through the public lookup', async () => {
    shopRepository.findOneOrFail.mockRejectedValueOnce(
      new EntityNotFoundError(Shop, { id: shop.id }),
    );

    await expect(service.findOne(shop.id)).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
    expect(shopRepository.findOneOrFail).toHaveBeenCalledWith({
      where: { id: shop.id, status: ShopStatus.ACTIVE },
      relations: { logoMedia: true },
    });
  });

  it('creates a pending shop and its owner in one transaction', async () => {
    const newShop = { ...shop };
    const newOwner = { ...ownerMembership };
    entityManager.create
      .mockReturnValueOnce(newShop)
      .mockReturnValueOnce(newOwner);
    entityManager.save
      .mockResolvedValueOnce(newShop)
      .mockResolvedValueOnce(newOwner);

    await expect(
      service.create(ownerId, {
        name: 'Re.wear Closet',
      }),
    ).resolves.toEqual({ ...newShop, logoMedia: null, logoUrl: null });
    expect(entityManager.create).toHaveBeenNthCalledWith(1, Shop, {
      name: 'Re.wear Closet',
      description: null,
      logoMediaId: null,
      status: ShopStatus.PENDING,
      onboardingRequired: true,
      approvedAt: null,
    });
    expect(entityManager.create).toHaveBeenNthCalledWith(2, ShopMember, {
      shopId: shop.id,
      userId: ownerId,
      memberRole: ShopMemberRole.OWNER,
    });
  });

  it('rejects shop creation if user already belongs to a shop', async () => {
    const newShop = { ...shop };
    entityManager.create.mockReturnValueOnce(newShop);
    entityManager.save.mockResolvedValueOnce(newShop);

    const duplicateError = new QueryFailedError(
      'INSERT INTO shop_members...',
      [],
      new Error(
        'duplicate key value violates unique constraint "UQ_shop_members_user"',
      ),
    );
    Object.assign(duplicateError, {
      driverError: { constraint: 'UQ_shop_members_user' },
    });
    entityManager.save.mockRejectedValueOnce(duplicateError);

    await expect(
      service.create(ownerId, {
        name: 'Re.wear Closet',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    [undefined, 'Existing description'],
    ['', null],
    ['New description', 'New description'],
  ])('updates a shop with description %p', async (description, expected) => {
    const existing = { ...shop, description: 'Existing description' };
    shopRepository.findOneOrFail.mockResolvedValueOnce(existing);
    shopRepository.save.mockImplementationOnce(
      async (entity) => entity as Shop,
    );

    await expect(
      service.update(shop.id, ownerId, {
        name: 'Updated shop',
        description,
        status: ShopStatus.INACTIVE,
      }),
    ).resolves.toMatchObject({
      name: 'Updated shop',
      description: expected,
      status: ShopStatus.INACTIVE,
    });
    expect(shopRepository.findOneOrFail).toHaveBeenCalledWith({
      where: { id: shop.id },
      lock: { mode: 'pessimistic_write' },
    });
    expect(shopRepository.save).toHaveBeenCalledWith(existing);
  });

  it('blocks editing shop profile fields while an application is pending review', async () => {
    shopRepository.findOneOrFail.mockResolvedValueOnce({ ...shop });
    entityManager.existsBy.mockResolvedValueOnce(true);

    await expect(
      service.update(shop.id, ownerId, { name: 'Edited during review' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(entityManager.existsBy).toHaveBeenCalledWith(ShopApplication, {
      shopId: shop.id,
      state: SHOP_APPLICATION_STATE.SUBMITTED,
    });
    expect(shopRepository.save).not.toHaveBeenCalled();
  });

  it('retires unused old shop logo when replaced', async () => {
    const oldLogoId = '11111111-1111-4111-8111-111111111111';
    const newLogoId = '22222222-2222-4222-8222-222222222222';
    const existing = { ...shop, logoMediaId: oldLogoId };
    shopRepository.findOneOrFail.mockResolvedValueOnce(existing);
    entityManager.existsBy
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    uploads.verifyMedia.mockResolvedValueOnce({
      id: newLogoId,
      storageKey: 'new-logo.jpg',
      mediaType: 'IMAGE',
      retiredAt: null,
    });
    shopRepository.save.mockImplementationOnce(
      async (entity) => entity as Shop,
    );

    const updated = await service.update(shop.id, ownerId, {
      logoMediaId: newLogoId,
    });

    expect(updated.logoUrl).toBe('https://public.test/new-logo.jpg');
    expect(entityManager.update).toHaveBeenCalledWith(
      Media,
      { id: oldLogoId },
      { isAttached: false, retiredAt: expect.any(Date) },
    );
  });

  it('does not allow the owner membership to be removed as staff', async () => {
    entityManager.findOneByOrFail.mockResolvedValueOnce(ownerMembership);

    await expect(
      service.removeMember(shop.id, ownerMembership.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(memberRepository.save).not.toHaveBeenCalled();
  });
});
