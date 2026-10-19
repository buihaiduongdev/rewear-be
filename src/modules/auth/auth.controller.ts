import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { User } from '@/modules/user/entities';
import { userSchema } from '@/modules/user/schemas';

import { AuthService } from './auth.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto';
import { AuthLoginGuard } from './guards';
import { messageSchema, tokenPairSchema } from './schemas';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Serialize(userSchema, { status: HttpStatus.CREATED })
  register(@Body() input: RegisterDto) {
    return this.authService.register(input);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthLoginGuard)
  @ApiBody({ type: LoginDto })
  @Serialize(tokenPairSchema)
  login(@CurrentUser() user: User) {
    return this.authService.login(user);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Serialize(tokenPairSchema)
  refresh(@Body() input: RefreshTokenDto) {
    return this.authService.refresh(input.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body() input: RefreshTokenDto) {
    return this.authService.logout(input.refreshToken);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Serialize(messageSchema)
  verifyEmail(@Body() input: VerifyEmailDto) {
    return this.authService.verifyEmail(input);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Serialize(messageSchema)
  resendVerification(@Body() input: ResendVerificationDto) {
    return this.authService.resendVerification(input);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Serialize(messageSchema)
  forgotPassword(@Body() input: ForgotPasswordDto) {
    return this.authService.forgotPassword(input);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Serialize(messageSchema)
  resetPassword(@Body() input: ResetPasswordDto) {
    return this.authService.resetPassword(input);
  }
}
