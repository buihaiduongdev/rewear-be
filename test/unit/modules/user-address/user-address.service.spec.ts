import { NotFoundException } from '@nestjs/common';

import type { DataSource, EntityManager, Repository } from 'typeorm';

import { UserAddress } from '@/modules/user-address/entities';
import { UserAddressService } from '@/modules/user-address/user-address.service';
import type { User } from '@/modules/user/entities';

describe('UserAddressService', () => {
  const userId = '459b0d3d-33f6-45fa-a1e2-5803f0bd4a72';
  const address: UserAddress = {
    id: '03dc31f1-ebac-4690-94f0-e91345e36ad8',
    userId,
    user: {} as User,
    recipientName: 'Nguyễn Văn A',
    label: 'Nhà',
    phone: '0912345678',
    addressLine1: '12 Nguyễn Huệ',
    addressLine2: null,
    countryCode: 'VN',
    provinceCode: '79',
    provinceName: 'Thành phố Hồ Chí Minh',
    wardCode: '26734',
    wardName: 'Phường Bến Nghé',
    postalCode: '700000',
    deliveryInstructions: null,
    isDefault: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const repository: jest.Mocked<
    Pick<
      Repository<UserAddress>,
      'find' | 'findOneBy' | 'create' | 'save' | 'remove'
    >
  > = {
    find: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const manager: jest.Mocked<Pick<EntityManager, 'update' | 'save'>> = {
    update: jest.fn(),
    save: jest.fn(),
  };
  const transaction = jest.fn(
    async (action: (entityManager: EntityManager) => Promise<UserAddress>) =>
      action(manager as unknown as EntityManager),
  );
  const service = new UserAddressService(
    repository as unknown as Repository<UserAddress>,
    { transaction } as unknown as DataSource,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists only the current user addresses with the default first', async () => {
    repository.find.mockResolvedValueOnce([address]);

    await expect(service.findAll(userId)).resolves.toEqual([address]);
    expect(repository.find).toHaveBeenCalledWith({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  });

  it('does not return an address outside the current user scope', async () => {
    repository.findOneBy.mockResolvedValueOnce(null);

    await expect(service.findOne(userId, address.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.findOneBy).toHaveBeenCalledWith({
      id: address.id,
      userId,
    });
  });

  it('creates a regular address without a transaction', async () => {
    const created = { ...address };
    repository.create.mockReturnValueOnce(created);
    repository.save.mockResolvedValueOnce(created);

    await expect(
      service.create(userId, {
        recipientName: address.recipientName,
        phone: address.phone,
        addressLine1: address.addressLine1,
        provinceCode: address.provinceCode,
        provinceName: address.provinceName,
        wardCode: address.wardCode,
        wardName: address.wardName,
      }),
    ).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith({
      recipientName: address.recipientName,
      phone: address.phone,
      addressLine1: address.addressLine1,
      provinceCode: address.provinceCode,
      provinceName: address.provinceName,
      wardCode: address.wardCode,
      wardName: address.wardName,
      userId,
      label: null,
      addressLine2: null,
      countryCode: 'VN',
      postalCode: null,
      deliveryInstructions: null,
      isDefault: false,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('unsets the previous default in the same transaction', async () => {
    const created = { ...address, isDefault: true };
    repository.create.mockReturnValueOnce(created);
    manager.update.mockResolvedValueOnce({ generatedMaps: [], raw: [] });
    manager.save.mockResolvedValueOnce(created);

    await expect(
      service.create(userId, {
        recipientName: address.recipientName,
        phone: address.phone,
        addressLine1: address.addressLine1,
        provinceCode: address.provinceCode,
        provinceName: address.provinceName,
        wardCode: address.wardCode,
        wardName: address.wardName,
        isDefault: true,
      }),
    ).resolves.toBe(created);
    expect(manager.update).toHaveBeenCalledWith(
      UserAddress,
      { userId, isDefault: true },
      { isDefault: false },
    );
    expect(manager.save).toHaveBeenCalledWith(UserAddress, created);
  });

  it('updates only an address owned by the current user', async () => {
    const existing = { ...address };
    repository.findOneBy.mockResolvedValueOnce(existing);
    repository.save.mockResolvedValueOnce({
      ...existing,
      recipientName: 'Trần Văn B',
    });

    await expect(
      service.update(userId, address.id, { recipientName: 'Trần Văn B' }),
    ).resolves.toMatchObject({ recipientName: 'Trần Văn B' });
    expect(repository.findOneBy).toHaveBeenCalledWith({
      id: address.id,
      userId,
    });
    expect(repository.save).toHaveBeenCalledWith({
      ...existing,
      recipientName: 'Trần Văn B',
    });
  });

  it('deletes only an address owned by the current user', async () => {
    repository.findOneBy.mockResolvedValueOnce(address);
    repository.remove.mockResolvedValueOnce(address);

    await expect(service.remove(userId, address.id)).resolves.toBeUndefined();
    expect(repository.remove).toHaveBeenCalledWith(address);
  });
});
