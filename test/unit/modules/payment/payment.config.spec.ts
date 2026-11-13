import { readMomoSettings } from '@/modules/payment/payment.config';
import {
  createPaymentSchema,
  momoIpnSchema,
} from '@/modules/payment/payment.schemas';

describe('MoMo Sandbox configuration and request validation', () => {
  it('is disabled without credentials and rejects partially enabled configuration without leaking secrets', () => {
    expect(readMomoSettings({})).toBeNull();
    expect(() =>
      readMomoSettings({
        MOMO_ENABLED: 'true',
        MOMO_SECRET_KEY: 'not-for-logs',
      }),
    ).toThrow('Invalid MoMo Sandbox environment configuration');
    expect(() => readMomoSettings({ MOMO_ENABLED: 'invalid' })).toThrow(
      'Invalid option',
    );
  });

  it('requires a server idempotency key and rejects client prices or fees', () => {
    const requestId = '7ecf9b7f-fcd2-4ab2-8768-c17773433b68';
    expect(createPaymentSchema.safeParse({ requestId }).success).toBe(true);
    expect(
      createPaymentSchema.safeParse({ requestId, amount: 1 }).success,
    ).toBe(false);
    expect(
      createPaymentSchema.safeParse({ requestId, shippingFee: 0 }).success,
    ).toBe(false);
    expect(momoIpnSchema.safeParse({ amount: '230000' }).success).toBe(false);
  });
});
