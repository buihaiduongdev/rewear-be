import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import * as argon2 from 'argon2';
import { Repository } from 'typeorm';

import { OrmFilterBuilder, paginate } from '@/common/pagination';
import type { IPaginatedResult } from '@/common/pagination';
import { AuthProvider } from '@/modules/auth/enums';
import type { RegisterInput } from '@/modules/auth/schemas/auth-input.schema';

import { User } from './entities';
import { UserRole, UserStatus } from './enums';
import type { FindUserQuery } from './schemas';
import type {
  CreateUserInput,
  UpdateProfileInput,
  UpdateUserInput,
} from './schemas/user-input.schema';

type OAuthProfile = {
  providerAccountId: string;
  email: string;
  fullName: string;
  provider: AuthProvider;
  isEmailVerified?: boolean;
};

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async register(input: RegisterInput): Promise<User> {
    await this.assertEmailAvailable(input.email);
    const user = this.userRepository.create({
      email: this.normalizeEmail(input.email),
      password: await argon2.hash(input.password),
      fullName: input.fullName.trim(),
      provider: AuthProvider.CREDENTIALS,
      providerAccountId: null,
      role: UserRole.USER,
      status: UserStatus.INACTIVE,
    });
    return this.userRepository.save(user);
  }

  async create(input: CreateUserInput): Promise<User> {
    await this.assertEmailAvailable(input.email);
    return this.userRepository.save(
      this.userRepository.create({
        email: this.normalizeEmail(input.email),
        password: await argon2.hash(input.password),
        fullName: input.fullName.trim(),
        provider: AuthProvider.CREDENTIALS,
        providerAccountId: null,
        role: input.role ?? UserRole.USER,
        status: input.status ?? UserStatus.ACTIVE,
      }),
    );
  }

  async findAll(query: FindUserQuery): Promise<IPaginatedResult<User>> {
    const builder = this.userRepository.createQueryBuilder('user');
    OrmFilterBuilder.create(builder)
      .andWhere(
        '(user.fullName ILIKE :search OR user.email ILIKE :search)',
        { search: `%${query.search}%` },
        Boolean(query.search),
      )
      .equal('user.role', query.role)
      .equal('user.status', query.status);

    return paginate(builder, query, {
      defaultSort: 'user.createdAt',
      allowedSorts: {
        createdAt: 'user.createdAt',
        email: 'user.email',
        fullName: 'user.fullName',
      },
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string, withPassword = false): Promise<User | null> {
    const query = this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = :email', {
        email: this.normalizeEmail(email),
      });
    if (withPassword) query.addSelect('user.password');
    return query.getOne();
  }

  async findOneByEmail(email: string): Promise<User | null> {
    return this.findByEmail(email, true);
  }

  async findOrCreateByOAuth(profile: OAuthProfile): Promise<User> {
    const byProvider = await this.userRepository.findOneBy({
      provider: profile.provider,
      providerAccountId: profile.providerAccountId,
    });
    if (byProvider) return byProvider;

    if (!profile.isEmailVerified) {
      throw new ConflictException('Email from OAuth provider must be verified');
    }

    const byEmail = await this.findByEmail(profile.email);
    if (byEmail) {
      if (!byEmail.providerAccountId) {
        byEmail.providerAccountId = profile.providerAccountId;
        return this.userRepository.save(byEmail);
      }
      return byEmail;
    }

    return this.userRepository.save(
      this.userRepository.create({
        email: this.normalizeEmail(profile.email),
        password: null,
        fullName: profile.fullName.trim(),
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      }),
    );
  }

  async update(id: string, input: UpdateUserInput): Promise<User> {
    const user = await this.findById(id);
    if (input.email && this.normalizeEmail(input.email) !== user.email) {
      await this.assertEmailAvailable(input.email);
      user.email = this.normalizeEmail(input.email);
    }
    if (input.password) user.password = await argon2.hash(input.password);
    if (input.fullName) user.fullName = input.fullName.trim();
    if (input.role) user.role = input.role;
    if (input.status) user.status = input.status;
    return this.userRepository.save(user);
  }

  async updateProfile(id: string, input: UpdateProfileInput): Promise<User> {
    const user = await this.findById(id);
    user.fullName = input.fullName.trim();
    return this.userRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const result = await this.userRepository.delete(id);
    if (!result.affected) throw new NotFoundException('User not found');
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    if (await this.findByEmail(email)) {
      throw new ConflictException('Email is already registered');
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
