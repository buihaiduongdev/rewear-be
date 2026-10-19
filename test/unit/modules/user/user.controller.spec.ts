import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { EPaginationOrder } from '@/common/constants';
import { AuthProvider } from '@/modules/auth/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';
import { FindUserQuery } from '@/modules/user/schemas';
import { UserController } from '@/modules/user/user.controller';
import type { UserService } from '@/modules/user/user.service';

jest.mock('@nestjs/swagger', () => ({
  ApiBearerAuth: () => () => undefined,
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
  ApiResponse: () => () => undefined,
  ApiTags: () => () => undefined,
  PartialType: (baseClass: new () => object) => class extends baseClass {},
}));
jest.mock('@/modules/auth/guards', () => ({
  JwtAuthGuard: class JwtAuthGuard {},
  RolesGuard: class RolesGuard {},
}));
jest.mock('@/modules/user/user.service', () => ({
  UserService: class UserService {},
}));

describe('UserController', () => {
  const user: User = {
    id: '9cc6906e-f032-4825-9d0e-39f74243655e',
    email: 'user@example.com',
    password: null,
    fullName: 'Rewear User',
    provider: AuthProvider.CREDENTIALS,
    providerAccountId: null,
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    refreshTokens: [],
    authTokens: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const userService: jest.Mocked<
    Pick<
      UserService,
      'findById' | 'updateProfile' | 'findAll' | 'create' | 'update' | 'remove'
    >
  > = {
    findById: jest.fn(),
    updateProfile: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const controller = new UserController(userService as unknown as UserService);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /users/me', () => {
    it('returns the current user', async () => {
      userService.findById.mockResolvedValueOnce(user);

      await expect(controller.getMe(user)).resolves.toBe(user);
      expect(userService.findById).toHaveBeenCalledWith(user.id);
    });

    it('propagates an error when the current user no longer exists', async () => {
      const error = new NotFoundException('User not found');
      userService.findById.mockRejectedValueOnce(error);

      await expect(controller.getMe(user)).rejects.toBe(error);
      expect(userService.findById).toHaveBeenCalledWith(user.id);
    });
  });

  describe('PATCH /users/me', () => {
    const input = { fullName: 'Updated User' };

    it('updates and returns the current user profile', async () => {
      const updatedUser = { ...user, fullName: input.fullName };
      userService.updateProfile.mockResolvedValueOnce(updatedUser);

      await expect(controller.updateMe(user, input)).resolves.toEqual(
        updatedUser,
      );
      expect(userService.updateProfile).toHaveBeenCalledWith(user.id, input);
    });

    it('propagates a profile update error', async () => {
      const error = new BadRequestException('Unable to update profile');
      userService.updateProfile.mockRejectedValueOnce(error);

      await expect(controller.updateMe(user, input)).rejects.toBe(error);
      expect(userService.updateProfile).toHaveBeenCalledWith(user.id, input);
    });
  });

  describe('GET /users', () => {
    const query: FindUserQuery = {
      page: 1,
      pageSize: 20,
      order: EPaginationOrder.DESC,
      search: 'rewear',
    };
    const result = {
      items: [user],
      meta: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPage: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };

    it('returns a paginated user list', async () => {
      userService.findAll.mockResolvedValueOnce(result);

      await expect(controller.findAll(query)).resolves.toEqual(result);
      expect(userService.findAll).toHaveBeenCalledWith(query);
    });

    it('propagates an error while listing users', async () => {
      const error = new BadRequestException('Unable to list users');
      userService.findAll.mockRejectedValueOnce(error);

      await expect(controller.findAll(query)).rejects.toBe(error);
      expect(userService.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('GET /users/:id', () => {
    it('returns the requested user', async () => {
      userService.findById.mockResolvedValueOnce(user);

      await expect(controller.findOne(user.id)).resolves.toBe(user);
      expect(userService.findById).toHaveBeenCalledWith(user.id);
    });

    it('propagates an error when the user does not exist', async () => {
      const error = new NotFoundException('User not found');
      userService.findById.mockRejectedValueOnce(error);

      await expect(controller.findOne(user.id)).rejects.toBe(error);
      expect(userService.findById).toHaveBeenCalledWith(user.id);
    });
  });

  describe('POST /users', () => {
    const input = {
      email: 'new-user@example.com',
      password: 'password123',
      fullName: 'New User',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
    };

    it('creates and returns a user', async () => {
      const createdUser = { ...user, ...input, password: null };
      userService.create.mockResolvedValueOnce(createdUser);

      await expect(controller.create(input)).resolves.toEqual(createdUser);
      expect(userService.create).toHaveBeenCalledWith(input);
    });

    it('propagates an email conflict error', async () => {
      const error = new ConflictException('Email is already registered');
      userService.create.mockRejectedValueOnce(error);

      await expect(controller.create(input)).rejects.toBe(error);
      expect(userService.create).toHaveBeenCalledWith(input);
    });
  });

  describe('PATCH /users/:id', () => {
    const input = {
      fullName: 'Updated User',
      status: UserStatus.INACTIVE,
    };

    it('updates and returns the requested user', async () => {
      const updatedUser = { ...user, ...input };
      userService.update.mockResolvedValueOnce(updatedUser);

      await expect(controller.update(user.id, input)).resolves.toEqual(
        updatedUser,
      );
      expect(userService.update).toHaveBeenCalledWith(user.id, input);
    });

    it('propagates an error when the user does not exist', async () => {
      const error = new NotFoundException('User not found');
      userService.update.mockRejectedValueOnce(error);

      await expect(controller.update(user.id, input)).rejects.toBe(error);
      expect(userService.update).toHaveBeenCalledWith(user.id, input);
    });
  });

  describe('DELETE /users/:id', () => {
    it('removes the requested user', async () => {
      userService.remove.mockResolvedValueOnce(undefined);

      await expect(controller.remove(user.id)).resolves.toBeUndefined();
      expect(userService.remove).toHaveBeenCalledWith(user.id);
    });

    it('propagates an error when the user does not exist', async () => {
      const error = new NotFoundException('User not found');
      userService.remove.mockRejectedValueOnce(error);

      await expect(controller.remove(user.id)).rejects.toBe(error);
      expect(userService.remove).toHaveBeenCalledWith(user.id);
    });
  });
});
