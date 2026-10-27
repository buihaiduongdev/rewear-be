import z from 'zod';

import { emailSchema } from '@/common/schemas/request.schema';

import { AuthProvider } from '../enums';

export const registerSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(8).max(72),
  fullName: z.string().trim().min(1).max(255),
});

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(8).max(72),
});

export const oauthLoginSchema = z.strictObject({
  provider: z.literal(AuthProvider.GOOGLE),
  token: z.string().min(1).describe('OAuth provider ID token'),
});

export const refreshTokenSchema = z.strictObject({
  refreshToken: z.string().min(1),
});

export const verifyEmailSchema = z.strictObject({ token: z.string().min(1) });
export const resendVerificationSchema = z.strictObject({ email: emailSchema });
export const forgotPasswordSchema = z.strictObject({ email: emailSchema });
export const resetPasswordSchema = z.strictObject({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});

export type RegisterInput = z.output<typeof registerSchema>;
export type OAuthLoginInput = z.output<typeof oauthLoginSchema>;
export type LoginInput = z.output<typeof loginSchema>;
export type RefreshTokenInput = z.output<typeof refreshTokenSchema>;
export type VerifyEmailInput = z.output<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.output<typeof resendVerificationSchema>;
export type ForgotPasswordInput = z.output<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.output<typeof resetPasswordSchema>;
