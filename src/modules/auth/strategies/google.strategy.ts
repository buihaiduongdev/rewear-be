import { Injectable, UnauthorizedException } from '@nestjs/common';

import { OAuth2Client } from 'google-auth-library';

import { ConfigService } from '@/modules/config';
import { User } from '@/modules/user/entities';
import { UserStatus } from '@/modules/user/enums';
import { UserService } from '@/modules/user/user.service';

import { AUTH_ERROR_CODE } from '../constants';
import { AuthProvider } from '../enums';
import { authError } from '../errors/auth.error';
import type { AuthStrategy } from '../interfaces/auth-strategy.interface';
import type { LoginInput } from '../schemas/auth-input.schema';

@Injectable()
export class GoogleAuthStrategy implements AuthStrategy {
  private readonly client: OAuth2Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    this.client = new OAuth2Client(this.configService.auth.googleClientId);
  }

  async validate({ token: idToken }: LoginInput): Promise<User> {
    if (!idToken) {
      throw new UnauthorizedException('Google ID token is required');
    }

    let ticket;
    try {
      ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.configService.auth.googleClientId,
      });
    } catch {
      throw new UnauthorizedException('Google token verification failed');
    }

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Invalid Google token payload');
    }
    if (!payload.email_verified) {
      throw new UnauthorizedException('Google email not verified');
    }

    const user = await this.userService.findOrCreateByOAuth({
      email: payload.email,
      fullName: payload.name ?? payload.email.split('@')[0],
      provider: AuthProvider.GOOGLE,
      providerAccountId: payload.sub,
      isEmailVerified: payload.email_verified,
    });

    if (user.status !== UserStatus.ACTIVE) {
      throw authError(
        AUTH_ERROR_CODE.EMAIL_UNVERIFIED,
        'Please verify your email before logging in',
      );
    }

    return user;
  }
}
