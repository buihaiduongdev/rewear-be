import { readPayosSettings } from '@/modules/payment/payment.config';
import {
  createPaymentSchema,
  payosWebhookSchema,
} from '@/modules/payment/schemas/payment.schema';

describe('PayOS gateway configuration and request validation', () => {
  it('is disabled without credentials and rejects partially enabled configuration without leaking secrets', () => {
    expect(readPayosSettings({})).toBeNull();
    expect(() =>
      readPayosSettings({
        PAYOS_ENABLED: 'true',
        PAYOS_CHECKSUM_KEY: 'not-for-logs',
      }),
    ).toThrow('Invalid PayOS environment configuration');
    expect(() => readPayosSettings({ PAYOS_ENABLED: 'invalid' })).toThrow(
      'Invalid option',
    );
  });

  it('requires a server idempotency key and rejects client prices or malformed webhook payloads', () => {
    const requestId = '7ecf9b7f-fcd2-4ab2-8768-c17773433b68';
    expect(createPaymentSchema.safeParse({ requestId }).success).toBe(true);
    expect(
      createPaymentSchema.safeParse({ requestId, amount: 1 }).success,
    ).toBe(false);
    expect(
      createPaymentSchema.safeParse({ requestId, shippingFee: 0 }).success,
    ).toBe(false);
    expect(
      payosWebhookSchema.safeParse({ data: { amount: '230000' } }).success,
    ).toBe(false);
  });
});
