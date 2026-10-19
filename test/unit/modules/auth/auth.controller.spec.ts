import { BadRequestException, UnauthorizedException } from '@nestjs/common';

import { AuthController } from '@/modules/auth/auth.controller';
import type { AuthService } from '@/modules/auth/auth.service';
import {
  ForgotPasswordDto,
  RefreshTokenDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from '@/modules/auth/dto';
import { AuthProvider } from '@/modules/auth/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

jest.mock('@nestjs/swagger', () => ({
  ApiBody: () => () => undefined,
  ApiProperty: () => () => undefined,
  ApiResponse: () => () => undefined,
  ApiTags: () => () => undefined,
}));
jest.mock('@/modules/auth/auth.service', () => ({
  AuthService: class AuthService {},
}));
jest.mock('@/modules/auth/guards', () => ({
  AuthLoginGuard: class AuthLoginGuard {},
}));

describe('AuthController', () => {
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
  const tokenPair = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    },
  };
  const message = { message: 'Request completed successfully' };
  const authService: jest.Mocked<
    Pick<
      AuthService,
      | 'register'
      | 'login'
      | 'refresh'
      | 'logout'
      | 'verifyEmail'
      | 'resendVerification'
      | 'forgotPassword'
      | 'resetPassword'
    >
  > = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    verifyEmail: jest.fn(),
    resendVerification: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };
  const controller = new AuthController(authService as unknown as AuthService);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('POST /auth/register', () => {
    const input: RegisterDto = {
      email: 'user@example.com',
      password: 'password123',
      fullName: 'Rewear User',
    };

    it('registers and returns the new user', async () => {
      authService.register.mockResolvedValueOnce(user);

      await expect(controller.register(input)).resolves.toBe(user);
      expect(authService.register).toHaveBeenCalledWith(input);
    });

    it('propagates a registration error', async () => {
      const error = new BadRequestException('Unable to register');
      authService.register.mockRejectedValueOnce(error);

      await expect(controller.register(input)).rejects.toBe(error);
      expect(authService.register).toHaveBeenCalledWith(input);
    });
  });

  describe('POST /auth/login', () => {
    it('returns a token pair for the authenticated user', async () => {
      authService.login.mockResolvedValueOnce(tokenPair);

      await expect(controller.login(user)).resolves.toEqual(tokenPair);
      expect(authService.login).toHaveBeenCalledWith(user);
    });

    it('propagates a login error', async () => {
      const error = new UnauthorizedException('Unable to login');
      authService.login.mockRejectedValueOnce(error);

      await expect(controller.login(user)).rejects.toBe(error);
      expect(authService.login).toHaveBeenCalledWith(user);
    });
  });

  describe('POST /auth/refresh', () => {
    const input: RefreshTokenDto = { refreshToken: 'refresh-token' };

    it('returns a rotated token pair', async () => {
      authService.refresh.mockResolvedValueOnce(tokenPair);

      await expect(controller.refresh(input)).resolves.toEqual(tokenPair);
      expect(authService.refresh).toHaveBeenCalledWith(input.refreshToken);
    });

    it('propagates an invalid refresh token error', async () => {
      const error = new UnauthorizedException('Invalid refresh token');
      authService.refresh.mockRejectedValueOnce(error);

      await expect(controller.refresh(input)).rejects.toBe(error);
      expect(authService.refresh).toHaveBeenCalledWith(input.refreshToken);
    });
  });

  describe('POST /auth/logout', () => {
    const input: RefreshTokenDto = { refreshToken: 'refresh-token' };

    it('revokes the refresh token and returns a message', async () => {
      const logoutMessage = { message: 'Logged out successfully' };
      authService.logout.mockResolvedValueOnce(logoutMessage);

      await expect(controller.logout(input)).resolves.toEqual(logoutMessage);
      expect(authService.logout).toHaveBeenCalledWith(input.refreshToken);
    });

    it('propagates a logout error', async () => {
      const error = new BadRequestException('Unable to logout');
      authService.logout.mockRejectedValueOnce(error);

      await expect(controller.logout(input)).rejects.toBe(error);
      expect(authService.logout).toHaveBeenCalledWith(input.refreshToken);
    });
  });

  describe('POST /auth/verify-email', () => {
    const input: VerifyEmailDto = { token: 'verification-token' };

    it('verifies the email and returns a message', async () => {
      authService.verifyEmail.mockResolvedValueOnce(message);

      await expect(controller.verifyEmail(input)).resolves.toEqual(message);
      expect(authService.verifyEmail).toHaveBeenCalledWith(input);
    });

    it('propagates an invalid verification token error', async () => {
      const error = new BadRequestException('Token is invalid or expired');
      authService.verifyEmail.mockRejectedValueOnce(error);

      await expect(controller.verifyEmail(input)).rejects.toBe(error);
      expect(authService.verifyEmail).toHaveBeenCalledWith(input);
    });
  });

  describe('POST /auth/resend-verification', () => {
    const input: ResendVerificationDto = { email: 'user@example.com' };

    it('resends verification and returns a message', async () => {
      authService.resendVerification.mockResolvedValueOnce(message);

      await expect(controller.resendVerification(input)).resolves.toEqual(
        message,
      );
      expect(authService.resendVerification).toHaveBeenCalledWith(input);
    });

    it('propagates a resend verification error', async () => {
      const error = new BadRequestException('Email is already verified');
      authService.resendVerification.mockRejectedValueOnce(error);

      await expect(controller.resendVerification(input)).rejects.toBe(error);
      expect(authService.resendVerification).toHaveBeenCalledWith(input);
    });
  });

  describe('POST /auth/forgot-password', () => {
    const input: ForgotPasswordDto = { email: 'user@example.com' };

    it('requests a password reset and returns a message', async () => {
      authService.forgotPassword.mockResolvedValueOnce(message);

      await expect(controller.forgotPassword(input)).resolves.toEqual(message);
      expect(authService.forgotPassword).toHaveBeenCalledWith(input);
    });

    it('propagates a forgot password error', async () => {
      const error = new BadRequestException('Unable to request password reset');
      authService.forgotPassword.mockRejectedValueOnce(error);

      await expect(controller.forgotPassword(input)).rejects.toBe(error);
      expect(authService.forgotPassword).toHaveBeenCalledWith(input);
    });
  });

  describe('POST /auth/reset-password', () => {
    const input: ResetPasswordDto = {
      token: 'reset-token',
      newPassword: 'new-password123',
    };

    it('resets the password and returns a message', async () => {
      authService.resetPassword.mockResolvedValueOnce(message);

      await expect(controller.resetPassword(input)).resolves.toEqual(message);
      expect(authService.resetPassword).toHaveBeenCalledWith(input);
    });

    it('propagates an invalid reset token error', async () => {
      const error = new BadRequestException('Token is invalid or expired');
      authService.resetPassword.mockRejectedValueOnce(error);

      await expect(controller.resetPassword(input)).rejects.toBe(error);
      expect(authService.resetPassword).toHaveBeenCalledWith(input);
    });
  });
});
