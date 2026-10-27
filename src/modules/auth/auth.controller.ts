import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Serialize } from '@/common/decorators';
import { userSchema } from '@/modules/user/schemas';

import { AuthService } from './auth.service';
import { messageSchema, tokenPairSchema } from './schemas';
import {
  forgotPasswordSchema,
  loginSchema,
  oauthLoginSchema,
  refreshTokenSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './schemas/auth-input.schema';
import type {
  ForgotPasswordInput,
  LoginInput,
  OAuthLoginInput,
  RefreshTokenInput,
  RegisterInput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from './schemas/auth-input.schema';
import { CredentialAuthStrategy } from './strategies/credential.strategy';
import { OAuthStrategyFactory } from './strategies/oauth-strategy.factory';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oauthStrategyFactory: OAuthStrategyFactory,
    private readonly credentialStrategy: CredentialAuthStrategy,
  ) {}

  @Post('register')
  @Serialize(userSchema, { status: HttpStatus.CREATED })
  register(@Body({ schema: registerSchema }) input: RegisterInput) {
    return this.authService.register(input);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Serialize(tokenPairSchema)
  async login(@Body({ schema: loginSchema }) input: LoginInput) {
    const user = await this.credentialStrategy.validate(input);
    return this.authService.login(user);
  }

  @Post('oauth')
  @HttpCode(HttpStatus.OK)
  @Serialize(tokenPairSchema)
  async oauth(@Body({ schema: oauthLoginSchema }) input: OAuthLoginInput) {
    const user = await this.oauthStrategyFactory
      .getStrategy(input.provider)
      .validate(input);
    return this.authService.login(user);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Serialize(tokenPairSchema)
  refresh(@Body({ schema: refreshTokenSchema }) input: RefreshTokenInput) {
    return this.authService.refresh(input.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Serialize(messageSchema)
  logout(@Body({ schema: refreshTokenSchema }) input: RefreshTokenInput) {
    return this.authService.logout(input.refreshToken);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Serialize(messageSchema)
  verifyEmail(@Body({ schema: verifyEmailSchema }) input: VerifyEmailInput) {
    return this.authService.verifyEmail(input);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Serialize(messageSchema)
  resendVerification(
    @Body({ schema: resendVerificationSchema }) input: ResendVerificationInput,
  ) {
    return this.authService.resendVerification(input);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Serialize(messageSchema)
  forgotPassword(
    @Body({ schema: forgotPasswordSchema }) input: ForgotPasswordInput,
  ) {
    return this.authService.forgotPassword(input);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Serialize(messageSchema)
  resetPassword(
    @Body({ schema: resetPasswordSchema }) input: ResetPasswordInput,
  ) {
    return this.authService.resetPassword(input);
  }
}
