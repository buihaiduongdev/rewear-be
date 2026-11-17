import { ConflictException } from '@nestjs/common';

import { QueryFailedError } from 'typeorm';
import type { Repository } from 'typeorm';

import { AuthProvider } from '@/modules/auth/enums';
import { ShopMember } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';
import { UserService } from '@/modules/user/user.service';

describe('UserService', () => {
  let service: UserService;
  let userRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOneByOrFail: jest.Mock;
    delete: jest.Mock;
  };
  let shopMemberRepository: {
    findOne: jest.Mock;
  };

  beforeEach(() => {
    userRepository = {
      create: jest.fn((plain: any) => plain),
      save: jest.fn(),
      findOneByOrFail: jest.fn(),
      delete: jest.fn(),
    };
    shopMemberRepository = {
      findOne: jest.fn(),
    };

    service = new UserService(
      userRepository as unknown as Repository<User>,
      shopMemberRepository as unknown as Repository<ShopMember>,
    );
  });

  describe('register', () => {
    it('creates and saves user directly without pre-checking email', async () => {
      const savedUser = {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'test@example.com',
        fullName: 'Test User',
        role: UserRole.USER,
        status: UserStatus.INACTIVE,
        provider: AuthProvider.CREDENTIALS,
        providerAccountId: null,
      };
      (userRepository.save as jest.Mock).mockResolvedValueOnce(savedUser);

      const result = await service.register({
        email: 'test@example.com',
        password: 'password123',
        fullName: 'Test User',
      });

      expect(userRepository.save).toHaveBeenCalled();
      expect(result).toEqual(savedUser);
    });

    it('maps UQ_users_email constraint violation to ConflictException', async () => {
      const duplicateError = new QueryFailedError(
        'INSERT INTO users...',
        [],
        new Error(
          'duplicate key value violates unique constraint "UQ_users_email"',
        ),
      );
      Object.assign(duplicateError, {
        driverError: { constraint: 'UQ_users_email' },
      });
      (userRepository.save as jest.Mock).mockRejectedValueOnce(duplicateError);

      await expect(
        service.register({
          email: 'test@example.com',
          password: 'password123',
          fullName: 'Test User',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
