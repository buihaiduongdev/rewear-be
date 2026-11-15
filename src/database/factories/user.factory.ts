import { faker } from '@faker-js/faker';
import * as argon2 from 'argon2';
import type { DeepPartial } from 'typeorm';

import { AuthProvider } from '@/modules/auth/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { BaseFactory } from './base.factory';

export class UserFactory extends BaseFactory<User> {
  definition(): DeepPartial<User> {
    return {
      email: faker.internet.email().toLowerCase(),
      fullName: faker.person.fullName(),
      password: 'unused',
      provider: AuthProvider.CREDENTIALS,
      providerAccountId: null,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
    };
  }

  override async create(
    override: DeepPartial<User> = {},
    options: { password?: string } = {},
  ): Promise<User> {
    const password = await argon2.hash(options.password ?? 'RewearSeed123!');
    return super.create({ ...override, password });
  }

  override async createMany(
    count: number,
    override: DeepPartial<User> = {},
    options: { password?: string } = {},
  ): Promise<User[]> {
    const password = await argon2.hash(options.password ?? 'RewearSeed123!');
    return super.createMany(count, { ...override, password });
  }
}
