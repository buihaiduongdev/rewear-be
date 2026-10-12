import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';

import * as argon2 from 'argon2';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import ms, { StringValue } from 'ms';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';

import { ConfigService } from '@/modules/config';
import { MailService } from '@/modules/mail';
import { User } from '@/modules/user/entities';
import { UserStatus } from '@/modules/user/enums';
import { UserService } from '@/modules/user/user.service';

import {
  ForgotPasswordDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto';
import { AuthToken, RefreshToken } from './entities';
import { AuthProvider, AuthTokenType } from './enums';
import type { JwtPayload, RefreshJwtPayload } from './types';

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  user: Pick<User, 'id' | 'email' | 'fullName' | 'role'>;
};
type Message = { message: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
    @InjectRepository(AuthToken)
    private readonly authTokenRepository: Repository<AuthToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  async register(input: RegisterDto): Promise<User> {
    const user = await this.userService.register(input);
    const token = await this.issueAuthToken(
      user.id,
      AuthTokenType.VERIFY_EMAIL,
      24 * 60 * 60 * 1000,
    );
    await this.mailService.sendVerificationEmail(user.email, token);
    return user;
  }

  async login(user: User): Promise<TokenPair> {
    return this.issueTokenPair(user);
  }

  async refresh(rawToken: string): Promise<TokenPair> {
    let payload: RefreshJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshJwtPayload>(rawToken, {
        secret: this.configService.auth.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.dataSource.transaction(async (manager) => {
      const refreshRepository = manager.getRepository(RefreshToken);
      const revokeResult = await refreshRepository.update(
        {
          id: payload.tokenId,
          userId: payload.sub,
          tokenHash: this.hashToken(rawToken),
          revokedAt: IsNull(),
          expiresAt: MoreThan(new Date()),
        },
        { revokedAt: new Date() },
      );
      if (revokeResult.affected !== 1) {
        throw new UnauthorizedException('Refresh token was revoked or expired');
      }

      const user = await manager.getRepository(User).findOneBy({
        id: payload.sub,
        status: UserStatus.ACTIVE,
      });
      if (!user) throw new UnauthorizedException('Account is inactive');

      return this.issueTokenPair(user, refreshRepository);
    });
  }

  async logout(rawToken: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { tokenHash: this.hashToken(rawToken), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async verifyEmail({ token: rawToken }: VerifyEmailDto): Promise<Message> {
    await this.consumeAuthToken(
      rawToken,
      AuthTokenType.VERIFY_EMAIL,
      async (manager, token) => {
        await manager.getRepository(User).update(token.userId, {
          status: UserStatus.ACTIVE,
        });
      },
    );
    return { message: 'Email verified successfully' };
  }

  async resendVerification(input: ResendVerificationDto): Promise<Message> {
    const user = await this.userService.findByEmail(input.email);
    if (!user) {
      return {
        message: 'If the email exists, a verification link has been sent.',
      };
    }

    if (user.status === UserStatus.ACTIVE) {
      throw new BadRequestException('Email is already verified');
    }

    const token = await this.issueAuthToken(
      user.id,
      AuthTokenType.VERIFY_EMAIL,
      24 * 60 * 60 * 1000,
    );
    await this.mailService.sendVerificationEmail(user.email, token);

    return { message: 'Verification email sent successfully.' };
  }

  async forgotPassword(input: ForgotPasswordDto): Promise<Message> {
    const user = await this.userService.findByEmail(input.email);
    if (user?.provider === AuthProvider.CREDENTIALS) {
      const token = await this.issueAuthToken(
        user.id,
        AuthTokenType.RESET_PASSWORD,
        15 * 60 * 1000,
      );
      await this.mailService.sendResetPasswordEmail(user.email, token);
    }
    return {
      message: 'If the account exists, a password reset email was sent.',
    };
  }

  async resetPassword(input: ResetPasswordDto): Promise<Message> {
    const password = await argon2.hash(input.newPassword);
    await this.consumeAuthToken(
      input.token,
      AuthTokenType.RESET_PASSWORD,
      async (manager, token) => {
        await manager.getRepository(User).update(token.userId, { password });
        await manager
          .getRepository(RefreshToken)
          .update(
            { userId: token.userId, revokedAt: IsNull() },
            { revokedAt: new Date() },
          );
      },
    );
    return { message: 'Password reset successfully' };
  }

  private async issueTokenPair(
    user: User,
    refreshRepository = this.refreshTokenRepository,
  ): Promise<TokenPair> {
    const tokenId = randomUUID();
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.auth.accessSecret,
        expiresIn: this.configService.auth.accessExpiresIn as StringValue,
      }),
      this.jwtService.signAsync(
        { ...payload, tokenId } satisfies RefreshJwtPayload,
        {
          secret: this.configService.auth.refreshSecret,
          expiresIn: this.configService.auth.refreshExpiresIn as StringValue,
        },
      ),
    ]);

    await refreshRepository.save(
      refreshRepository.create({
        id: tokenId,
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(
          Date.now() +
            ms(this.configService.auth.refreshExpiresIn as StringValue),
        ),
        revokedAt: null,
      }),
    );
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  private async issueAuthToken(
    userId: string,
    type: AuthTokenType,
    lifetimeMs: number,
  ): Promise<string> {
    const rawToken = randomBytes(32).toString('hex');
    await this.authTokenRepository.update(
      { userId, type, usedAt: IsNull() },
      { usedAt: new Date() },
    );
    await this.authTokenRepository.save(
      this.authTokenRepository.create({
        userId,
        type,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + lifetimeMs),
        usedAt: null,
      }),
    );
    return rawToken;
  }

  private async consumeAuthToken(
    rawToken: string,
    type: AuthTokenType,
    action: (manager: DataSource['manager'], token: AuthToken) => Promise<void>,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AuthToken);
      const token = await repository.findOneBy({
        tokenHash: this.hashToken(rawToken),
        type,
        usedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      });
      if (!token) throw new BadRequestException('Token is invalid or expired');

      const result = await repository.update(
        { id: token.id, usedAt: IsNull() },
        { usedAt: new Date() },
      );
      if (result.affected !== 1) {
        throw new BadRequestException('Token is invalid or expired');
      }
      await action(manager, token);
    });
  }

  private hashToken(token: string): string {
    return createHmac('sha256', this.configService.auth.refreshSecret)
      .update(token)
      .digest('hex');
  }
}
