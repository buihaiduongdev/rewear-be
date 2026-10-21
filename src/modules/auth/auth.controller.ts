import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { User } from '@/modules/user/entities';
import { userSchema } from '@/modules/user/schemas';

import { AuthService } from './auth.service';
import { AuthLoginGuard } from './guards';
import { messageSchema, tokenPairSchema } from './schemas';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './schemas/auth-input.schema';
import type {
  ForgotPasswordInput,
  LoginInput,
  RefreshTokenInput,
  RegisterInput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from './schemas/auth-input.schema';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Serialize(userSchema, { status: HttpStatus.CREATED })
  register(@Body({ schema: registerSchema }) input: RegisterInput) {
    return this.authService.register(input);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthLoginGuard)
  @Serialize(tokenPairSchema)
  login(
    @CurrentUser() user: User,
    @Body({ schema: loginSchema }) _input: LoginInput,
  ) {
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
