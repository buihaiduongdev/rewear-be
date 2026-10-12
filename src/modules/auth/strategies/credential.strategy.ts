import { Injectable } from '@nestjs/common';

import { verify } from 'argon2';

import { User } from '@/modules/user/entities';
import { UserStatus } from '@/modules/user/enums';
import { UserService } from '@/modules/user/user.service';

import { AUTH_ERROR_CODE } from '../constants';
import { LoginDto } from '../dto';
import { authError } from '../errors/auth.error';
import type { AuthStrategy } from '../interfaces/auth-strategy.interface';

@Injectable()
export class CredentialAuthStrategy implements AuthStrategy {
  constructor(private readonly userService: UserService) {}

  async validate({ email, password }: LoginDto): Promise<User> {
    if (!email || !password) {
      throw authError(
        AUTH_ERROR_CODE.INVALID_CREDENTIALS,
        'Email and password are required',
      );
    }

    const user = await this.userService.findOneByEmail(email);
    if (!user?.password || !(await verify(user.password, password))) {
      throw authError(
        AUTH_ERROR_CODE.INVALID_CREDENTIALS,
        'Invalid email or password',
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw authError(
        AUTH_ERROR_CODE.EMAIL_UNVERIFIED,
        'Please verify your email before logging in',
      );
    }

    return user;
  }
}
