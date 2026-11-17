import { ForbiddenException } from '@nestjs/common';

import { EntityNotFoundError } from 'typeorm';
import type { DataSource, EntityManager, Repository } from 'typeorm';

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
      'find' | 'findOneBy' | 'findOneByOrFail' | 'save' | 'merge'
    >
  > = {
    find: jest.fn(),
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
  const service = new ShopService(
    shopRepository as unknown as Repository<Shop>,
    memberRepository as unknown as Repository<ShopMember>,
    dataSource as unknown as DataSource,
    { initializeDefaultRoles: jest.fn() } as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    entityManager.getRepository.mockReturnValue(shopRepository);
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

    await expect(service.findAll()).resolves.toEqual([shop]);
    expect(shopRepository.find).toHaveBeenCalledWith({
      where: { status: ShopStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  });

  it('does not expose an inactive shop through the public lookup', async () => {
    shopRepository.findOneByOrFail.mockRejectedValueOnce(
      new EntityNotFoundError(Shop, { id: shop.id }),
    );

    await expect(service.findOne(shop.id)).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
    expect(shopRepository.findOneByOrFail).toHaveBeenCalledWith({
      id: shop.id,
      status: ShopStatus.ACTIVE,
    });
  });

  it('creates the shop and its active owner in one transaction', async () => {
    const newShop = { ...shop };
    const newOwner = { ...ownerMembership };
    entityManager.create
      .mockReturnValueOnce(newShop)
      .mockReturnValueOnce(newOwner);
    entityManager.save
      .mockResolvedValueOnce(newShop)
      .mockResolvedValueOnce(newOwner);
    dataSource.transaction.mockImplementationOnce(
      async (run: (manager: EntityManager) => Promise<Shop>) =>
        run(entityManager as unknown as EntityManager),
    );

    await expect(
      service.create(ownerId, {
        name: 'Re.wear Closet',
      }),
    ).resolves.toBe(newShop);
    expect(entityManager.create).toHaveBeenNthCalledWith(1, Shop, {
      name: 'Re.wear Closet',
      description: null,
      status: ShopStatus.ACTIVE,
    });
    expect(entityManager.create).toHaveBeenNthCalledWith(2, ShopMember, {
      shopId: shop.id,
      userId: ownerId,
      memberRole: ShopMemberRole.OWNER,
    });
  });

  it.each([
    [undefined, 'Existing description'],
    ['', null],
    ['New description', 'New description'],
  ])('updates a shop with description %p', async (description, expected) => {
    const existing = { ...shop, description: 'Existing description' };
    shopRepository.findOneByOrFail
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(existing);
    memberRepository.findOneBy.mockResolvedValueOnce(ownerMembership);
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
    expect(shopRepository.save).toHaveBeenCalledWith(existing);
  });

  it('does not allow the owner membership to be removed as staff', async () => {
    entityManager.findOneBy.mockResolvedValueOnce(ownerMembership);
    entityManager.findOneByOrFail.mockResolvedValueOnce(ownerMembership);
    dataSource.transaction.mockImplementationOnce(
      async (run: (manager: EntityManager) => Promise<void>) =>
        run(entityManager as unknown as EntityManager),
    );

    await expect(
      service.removeMember(shop.id, ownerMembership.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(memberRepository.save).not.toHaveBeenCalled();
  });
});
