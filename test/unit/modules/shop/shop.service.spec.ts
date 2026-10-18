import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import type { DataSource, EntityManager, Repository } from 'typeorm';

import { Shop, ShopMember } from '@/modules/shop/entities';
import {
  ShopMemberRole,
  ShopMemberStatus,
  ShopStatus,
} from '@/modules/shop/enums';
import { ShopService } from '@/modules/shop/shop.service';
import { User } from '@/modules/user/entities';

describe('ShopService', () => {
  const ownerId = 'eb9ab2f0-97dd-456c-809f-75831b227895';
  const staffUserId = '40e2a58e-e61f-4c6c-a0b6-6e98b282c344';
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
    status: ShopMemberStatus.ACTIVE,
    joinedAt: new Date('2026-10-18T00:00:00.000Z'),
    createdAt: new Date('2026-10-18T00:00:00.000Z'),
    updatedAt: new Date('2026-10-18T00:00:00.000Z'),
  };
  const staffMembership: ShopMember = {
    ...ownerMembership,
    id: 'cd6f4fd6-68c9-40a5-aa37-043f239b1aa9',
    userId: staffUserId,
    user: {
      id: staffUserId,
      email: 'staff@example.com',
      fullName: 'Shop Staff',
    } as User,
    memberRole: ShopMemberRole.STAFF,
  };

  const shopRepository: jest.Mocked<
    Pick<Repository<Shop>, 'find' | 'findOneBy' | 'save'>
  > = {
    find: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(),
  };
  const memberRepository: jest.Mocked<
    Pick<
      Repository<ShopMember>,
      'find' | 'findOne' | 'findOneBy' | 'create' | 'save'
    >
  > = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const userRepository: jest.Mocked<Pick<Repository<User>, 'findOneBy'>> = {
    findOneBy: jest.fn(),
  };
  const entityManager = {
    create: jest.fn(),
    save: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(),
  };
  const service = new ShopService(
    shopRepository as unknown as Repository<Shop>,
    memberRepository as unknown as Repository<ShopMember>,
    userRepository as unknown as Repository<User>,
    dataSource as unknown as DataSource,
  );

  beforeEach(() => {
    jest.resetAllMocks();
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
    shopRepository.findOneBy.mockResolvedValueOnce(null);

    await expect(service.findOne(shop.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(shopRepository.findOneBy).toHaveBeenCalledWith({
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
        name: '  Re.wear Closet  ',
        description: '   ',
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
      status: ShopMemberStatus.ACTIVE,
    });
  });

  it('requires an active owner membership before updating a shop', async () => {
    shopRepository.findOneBy.mockResolvedValueOnce(shop);
    memberRepository.findOneBy.mockResolvedValueOnce(null);

    await expect(
      service.update(shop.id, staffUserId, { name: 'New name' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(shopRepository.save).not.toHaveBeenCalled();
  });

  it('rejects adding a user who is already a shop member', async () => {
    shopRepository.findOneBy.mockResolvedValueOnce(shop);
    memberRepository.findOneBy
      .mockResolvedValueOnce(ownerMembership)
      .mockResolvedValueOnce(staffMembership);
    userRepository.findOneBy.mockResolvedValueOnce(staffMembership.user);

    await expect(
      service.addStaff(shop.id, ownerId, { userId: staffUserId }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(memberRepository.save).not.toHaveBeenCalled();
  });

  it('adds staff and reloads the member with safe user details', async () => {
    const unsavedStaff = { ...staffMembership, user: undefined as never };
    shopRepository.findOneBy.mockResolvedValueOnce(shop);
    memberRepository.findOneBy
      .mockResolvedValueOnce(ownerMembership)
      .mockResolvedValueOnce(null);
    userRepository.findOneBy.mockResolvedValueOnce(staffMembership.user);
    memberRepository.create.mockReturnValueOnce(unsavedStaff);
    memberRepository.save.mockResolvedValueOnce(unsavedStaff);
    memberRepository.findOne.mockResolvedValueOnce(staffMembership);

    await expect(
      service.addStaff(shop.id, ownerId, { userId: staffUserId }),
    ).resolves.toBe(staffMembership);
    expect(memberRepository.findOne).toHaveBeenCalledWith({
      where: { id: staffMembership.id, shopId: shop.id },
      relations: { user: true },
    });
  });

  it('does not allow the owner membership to be disabled as staff', async () => {
    shopRepository.findOneBy.mockResolvedValueOnce(shop);
    memberRepository.findOneBy
      .mockResolvedValueOnce(ownerMembership)
      .mockResolvedValueOnce(ownerMembership);

    await expect(
      service.updateStaff(shop.id, ownerMembership.id, ownerId, {
        status: ShopMemberStatus.INACTIVE,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(memberRepository.save).not.toHaveBeenCalled();
  });
});
