export const AUTH_ERROR_CODE = {
  INVALID_CREDENTIALS: 'invalid_credentials',
  EMAIL_UNVERIFIED: 'email_unverified',
} as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODE)[keyof typeof AUTH_ERROR_CODE];
