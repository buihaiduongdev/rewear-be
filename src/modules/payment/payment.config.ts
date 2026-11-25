import ms from 'ms';
import z from 'zod';

export const PAYOS_CLIENT = Symbol('PAYOS_CLIENT');

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
