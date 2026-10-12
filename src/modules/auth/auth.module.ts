import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { StringValue } from 'ms';

import { ConfigService } from '@/modules/config';
import { MailModule } from '@/modules/mail';
import { UserModule } from '@/modules/user/user.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthToken, RefreshToken } from './entities';
import { AuthStrategyFactory } from './strategies/auth-strategy';
import { CredentialAuthStrategy } from './strategies/credential.strategy';
import { GoogleAuthStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuthToken, RefreshToken]),
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.auth.accessSecret,
        signOptions: {
          expiresIn: configService.auth.accessExpiresIn as StringValue,
        },
      }),
    }),
    UserModule,
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    AuthStrategyFactory,
    CredentialAuthStrategy,
    GoogleAuthStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
