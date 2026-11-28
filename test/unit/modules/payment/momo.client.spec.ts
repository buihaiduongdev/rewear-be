import { MomoClient, MomoTransportError } from '@/modules/payment/momo.client';
import { readMomoSettings } from '@/modules/payment/payment.config';
import {
  momoIpnSchema,
  resolvePaymentRefundSchema,
} from '@/modules/payment/schemas/payment.schema';

const settings = {
  partnerCode: 'MOMO_TEST',
  accessKey: 'access-key-test',
  secretKey: 'secret-key-test',
  endpoint: 'https://test-payment.momo.vn',
  redirectUrl: 'https://rewear.test/payment-result',
  ipnUrl: 'https://api.rewear.test/api/v1/payments/momo/ipn',
  timeoutMs: 30000,
};

function okJson(body: unknown) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  });
}

describe('MoMo sandbox config and schemas', () => {
  it('stays disabled by default and rejects partial config without leaking secrets', () => {
    expect(readMomoSettings({})).toBeNull();
    expect(() =>
      readMomoSettings({
        MOMO_ENABLED: 'true',
        MOMO_SECRET_KEY: 'super-secret-value',
      }),
    ).toThrow('Invalid MoMo environment configuration');
    expect(() => readMomoSettings({ MOMO_ENABLED: 'maybe' })).toThrow(
      'Invalid option',
    );

    const parsed = readMomoSettings({
      MOMO_ENABLED: 'true',
      MOMO_PARTNER_CODE: 'MOMO',
      MOMO_ACCESS_KEY: 'ak',
      MOMO_SECRET_KEY: 'sk',
      MOMO_REDIRECT_URL: 'https://rewear.test/return',
      MOMO_IPN_URL: 'https://api.rewear.test/api/v1/payments/momo/ipn',
    });
    expect(parsed?.endpoint).toBe('https://test-payment.momo.vn');
  });

  it('validates MoMo IPN and Admin refund resolution schemas', () => {
    expect(
      resolvePaymentRefundSchema.safeParse({
        action: 'CREDIT_WALLET',
      }).success,
    ).toBe(true);
    expect(
      resolvePaymentRefundSchema.safeParse({
        action: 'MANUAL_TRANSFER',
      }).success,
    ).toBe(false);
    expect(
      resolvePaymentRefundSchema.safeParse({
        action: 'MANUAL_TRANSFER',
        bankReference: 'VCB-991122',
      }).success,
    ).toBe(true);
    expect(
      momoIpnSchema.safeParse({
        partnerCode: 'MOMO_TEST',
        orderId: '1700000000123',
        requestId: 'req-1',
        amount: 230000,
        orderInfo: 'Rewear order',
        orderType: 'momo_wallet',
        transId: 400123456,
        resultCode: 0,
        message: 'Successful.',
        payType: 'qr',
        responseTime: 1700000001000,
        extraData: '',
        signature: 'abc',
      }).success,
    ).toBe(true);
  });
});

describe('MomoClient HMAC-SHA256 protocol', () => {
  it('signs and submits createPayment requests to MoMo v2 create endpoint', async () => {
    const fetcher = okJson({
      partnerCode: settings.partnerCode,
      orderId: '1700000000123',
      requestId: 'req-1',
      amount: 230000,
      resultCode: 0,
      message: 'Successful.',
      payUrl: 'https://test-payment.momo.vn/v2/gateway/pay?t=123',
      qrCodeUrl: 'momo://qr',
    });
    const client = new MomoClient(settings, fetcher);
    const result = await client.createPayment({
      orderId: '1700000000123',
      requestId: 'req-1',
      amount: 230000,
      orderInfo: 'Rewear order #1',
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://test-payment.momo.vn/v2/gateway/api/create');
    const sent = JSON.parse(init.body as string);
    const expectedSig = client.sign(
      `accessKey=${settings.accessKey}&amount=230000&extraData=&ipnUrl=${settings.ipnUrl}&orderId=1700000000123&orderInfo=Rewear order #1&partnerCode=${settings.partnerCode}&redirectUrl=${settings.redirectUrl}&requestId=req-1&requestType=captureWallet`,
    );
    expect(sent.signature).toBe(expectedSig);
    expect(result.status).toBe('PENDING');
    expect(result.payUrl).toBe(
      'https://test-payment.momo.vn/v2/gateway/pay?t=123',
    );
  });

  it('verifies valid IPN signatures and rejects tampered payloads or wrong partner', () => {
    const client = new MomoClient(settings);
    const basePayload = {
      partnerCode: settings.partnerCode,
      orderId: '1700000000123',
      requestId: 'req-1',
      amount: 230000,
      orderInfo: 'Rewear order #1',
      orderType: 'momo_wallet',
      transId: 400123456,
      resultCode: 0,
      message: 'Successful.',
      payType: 'qr',
      responseTime: 1700000001000,
      extraData: '',
    };
    const raw =
      `accessKey=${settings.accessKey}&amount=${basePayload.amount}&extraData=${basePayload.extraData}` +
      `&message=${basePayload.message}&orderId=${basePayload.orderId}&orderInfo=${basePayload.orderInfo}` +
      `&orderType=${basePayload.orderType}&partnerCode=${basePayload.partnerCode}&payType=${basePayload.payType}` +
      `&requestId=${basePayload.requestId}&responseTime=${basePayload.responseTime}` +
      `&resultCode=${basePayload.resultCode}&transId=${basePayload.transId}`;
    const signature = client.sign(raw);

    const verified = client.verifyIpnSignature({ ...basePayload, signature });
    expect(verified).toEqual({
      orderId: '1700000000123',
      requestId: 'req-1',
      amount: 230000,
      transId: '400123456',
      resultCode: 0,
      message: 'Successful.',
      status: 'PAID',
    });

    expect(() =>
      client.verifyIpnSignature({
        ...basePayload,
        amount: 220000,
        signature,
      }),
    ).toThrow('Invalid MoMo IPN signature');

    expect(() =>
      client.verifyIpnSignature({
        ...basePayload,
        partnerCode: 'OTHER',
        signature,
      }),
    ).toThrow('Invalid MoMo IPN partnerCode');
  });

  it('queries transaction status and executes refund requests cleanly', async () => {
    const queryFetcher = okJson({
      orderId: '1700000000123',
      requestId: 'req-1',
      amount: 230000,
      transId: 400123456,
      resultCode: 0,
      message: 'Successful.',
    });
    const queryClient = new MomoClient(settings, queryFetcher);
    const queried = await queryClient.queryStatus('1700000000123', 'req-1');
    expect(queried).toMatchObject({
      status: 'PAID',
      amount: 230000,
      amountPaid: 230000,
      providerTransId: '400123456',
    });

    const refundFetcher = okJson({
      orderId: 'REFUND_1',
      requestId: 'REQ_1',
      amount: 230000,
      transId: 400999999,
      resultCode: 0,
      message: 'Refund successful',
    });
    const refundClient = new MomoClient(settings, refundFetcher);
    const refunded = await refundClient.refund({
      orderId: 'REFUND_1',
      requestId: 'REQ_1',
      amount: 230000,
      transId: 400123456,
      description: 'Late payment refund',
    });
    expect(refunded.succeeded).toBe(true);
    expect(refunded.transId).toBe('400999999');

    const failingClient = new MomoClient(
      settings,
      jest.fn().mockRejectedValue(new Error('secret-key-test leak')),
    );
    await expect(
      failingClient.queryStatus('1700000000123', 'req-1'),
    ).rejects.toThrow(MomoTransportError);
  });
});
