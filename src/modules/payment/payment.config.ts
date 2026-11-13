import z from 'zod';

export const MOMO_CLIENT = Symbol('MOMO_CLIENT');
export const momoSettingsSchema = z.object({
  partnerCode: z.string().min(1).max(50),
  accessKey: z.string().min(1),
  secretKey: z.string().min(1),
  ipnUrl: z.url().startsWith('https://'),
  redirectUrl: z.url().startsWith('https://'),
  timeoutMs: z.coerce.number().int().min(30000).max(60000).default(30000),
});

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
    ipnUrl: environment.MOMO_IPN_URL,
    redirectUrl: environment.MOMO_REDIRECT_URL,
    timeoutMs: environment.MOMO_TIMEOUT_MS,
  });
  // Do not include validation input (which contains credentials) in exceptions.
  if (!result.success)
    throw new Error('Invalid MoMo Sandbox environment configuration');
  return result.data;
}
