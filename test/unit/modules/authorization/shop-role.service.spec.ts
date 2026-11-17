import { BadRequestException, ConflictException } from '@nestjs/common';

import { QueryFailedError } from 'typeorm';
import type { DataSource, EntityManager } from 'typeorm';

import { ShopRole } from '@/modules/authorization/entities/shop-role.entity';
import { ShopRoleService } from '@/modules/authorization/shop-role.service';

describe('ShopRoleService', () => {
  let service: ShopRoleService;
  let mockManager: {
    save: jest.Mock;
    create: jest.Mock;
    findOneByOrFail: jest.Mock;
    delete: jest.Mock;
    findBy: jest.Mock;
  };
  let mockDataSource: {
    transaction: jest.Mock;
  };

  const shopId = '77777777-7777-4777-8777-777777777777';
  const roleId = '88888888-8888-4888-8888-888888888888';

  beforeEach(() => {
    mockManager = {
      save: jest.fn(),
      create: jest.fn((_entityClass, plain) => plain as any),
      findOneByOrFail: jest.fn(),
      delete: jest.fn(),
      findBy: jest.fn(),
    };

    mockDataSource = {
      transaction: jest.fn((cb: (manager: EntityManager) => any) =>
        cb(mockManager as unknown as EntityManager),
      ),
    };

    service = new ShopRoleService(mockDataSource as unknown as DataSource);
  });

  describe('create', () => {
    it('creates a new role without pre-checking existence', async () => {
      const savedRole = {
        id: roleId,
        shopId,
        name: 'STAFF',
        isDefault: false,
      };
      mockManager.save.mockResolvedValueOnce(savedRole);

      const result = await service.create(shopId, {
        name: 'STAFF',
        permissions: ['order.view'],
      });

      expect(mockManager.save).toHaveBeenCalled();
      expect(result).toEqual({
        ...savedRole,
        permissions: ['order.view'],
      });
    });

    it('rejects reserved OWNER role name', () => {
      expect(() =>
        service.create(shopId, { name: 'owner', permissions: [] }),
      ).toThrow(BadRequestException);
    });

    it('maps unique constraint violation to ConflictException', async () => {
      const duplicateError = new QueryFailedError(
        'INSERT INTO shop_roles...',
        [],
        new Error(
          'duplicate key value violates unique constraint "UQ_shop_roles_shop_id_name"',
        ),
      );
      Object.assign(duplicateError, {
        driverError: { constraint: 'UQ_shop_roles_shop_id_name' },
      });
      mockManager.save.mockRejectedValueOnce(duplicateError);

      await expect(
        service.create(shopId, { name: 'STAFF', permissions: [] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('maps unique constraint violation on name change to ConflictException', async () => {
      const existingRole = {
        id: roleId,
        shopId,
        name: 'STAFF',
        isDefault: false,
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockManager.findOneByOrFail.mockResolvedValueOnce(
        existingRole as unknown as ShopRole,
      );

      const duplicateError = new QueryFailedError(
        'UPDATE shop_roles...',
        [],
        new Error(
          'duplicate key value violates unique constraint "UQ_shop_roles_shop_id_name"',
        ),
      );
      Object.assign(duplicateError, {
        driverError: { constraint: 'UQ_shop_roles_shop_id_name' },
      });
      mockManager.save.mockRejectedValueOnce(duplicateError);

      await expect(
        service.update(shopId, roleId, { name: 'NEW_NAME' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
