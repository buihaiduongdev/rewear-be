import ms from 'ms';
import z from 'zod';

export const PAYOS_CLIENT = Symbol('PAYOS_CLIENT');
export const MOMO_CLIENT = Symbol('MOMO_CLIENT');

export const DEFAULT_MOMO_SANDBOX_ENDPOINT = 'https://test-payment.momo.vn';

export const payosSettingsSchema = z.object({
  clientId: z.string().min(1),
  apiKey: z.string().min(1),
  checksumKey: z.string().min(1),
  returnUrl: z.url(),
  cancelUrl: z.url(),
  timeoutMs: z.coerce
    .number()
    .int()
    .min(ms('5s'))
    .max(ms('1m'))
    .default(ms('30s')),
});

export const momoSettingsSchema = z.object({
  partnerCode: z.string().min(1),
  accessKey: z.string().min(1),
  secretKey: z.string().min(1),
  endpoint: z.url().default(DEFAULT_MOMO_SANDBOX_ENDPOINT),
  redirectUrl: z.url(),
  ipnUrl: z.url(),
  timeoutMs: z.coerce
    .number()
    .int()
    .min(ms('5s'))
    .max(ms('1m'))
    .default(ms('30s')),
});

export function readPayosSettings(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const enabled = z
    .enum(['true', 'false'])
    .default('false')
    .parse(environment.PAYOS_ENABLED);
  if (enabled === 'false') return null;
  const result = payosSettingsSchema.safeParse({
    clientId: environment.PAYOS_CLIENT_ID,
    apiKey: environment.PAYOS_API_KEY,
    checksumKey: environment.PAYOS_CHECKSUM_KEY,
    returnUrl: environment.PAYOS_RETURN_URL,
    cancelUrl: environment.PAYOS_CANCEL_URL,
    timeoutMs: environment.PAYOS_TIMEOUT_MS,
  });
  // Do not include validation input (which contains credentials) in exceptions.
  if (!result.success) {
    throw new Error('Invalid PayOS environment configuration');
  }
  return result.data;
}

export function readMomoSettings(environment: NodeJS.ProcessEnv = process.env) {
  const enabled = z
    .enum(['true', 'false'])
    .default('false')
    .parse(environment.MOMO_ENABLED);
  if (enabled === 'false') return null;
  const result = momoSettingsSchema.safeParse({
    partnerCode: environment.MOMO_PARTNER_CODE,
    accessKey: environment.MOMO_ACCESS_KEY,
    secretKey: environment.MOMO_SECRET_KEY,
    endpoint: environment.MOMO_ENDPOINT || DEFAULT_MOMO_SANDBOX_ENDPOINT,
    redirectUrl: environment.MOMO_REDIRECT_URL,
    ipnUrl: environment.MOMO_IPN_URL,
    timeoutMs: environment.MOMO_TIMEOUT_MS,
  });
  // Do not include validation input (which contains credentials) in exceptions.
  if (!result.success) {
    throw new Error('Invalid MoMo environment configuration');
  }
  return result.data;
}
