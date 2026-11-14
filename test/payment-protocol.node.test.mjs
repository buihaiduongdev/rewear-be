import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const source = await readFile(
  new URL(
    '../src/infrastructure/payment/momo-sandbox.client.ts',
    import.meta.url,
  ),
  'utf8',
);
const api = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`
);
const config = {
  partnerCode: 'TEST',
  accessKey: 'access',
  secretKey: 'secret',
  ipnUrl: 'https://merchant.test/api/payments/momo/ipn',
  redirectUrl: 'https://merchant.test/payment',
  timeoutMs: 30000,
};
const sign = (raw) => createHmac('sha256', 'secret').update(raw).digest('hex');
const ipn = {
  partnerCode: 'TEST',
  orderId: 'attempt-1',
  requestId: 'request-1',
  amount: 230000,
  orderInfo: 'Rewear checkout',
  orderType: 'momo_wallet',
  transId: 123456,
  resultCode: 0,
  message: 'Successful.',
  payType: 'qr',
  responseTime: 1700000000000,
  extraData: '',
};
const signedIpn = () => ({
  ...ipn,
  signature: sign(
    'accessKey=access&amount=230000&extraData=&message=Successful.&orderId=attempt-1&orderInfo=Rewear checkout&orderType=momo_wallet&partnerCode=TEST&payType=qr&requestId=request-1&responseTime=1700000000000&resultCode=0&transId=123456',
  ),
});

test('verifies the documented IPN field order, rejects tampering and malformed signatures', () => {
  const client = new api.MomoSandboxClient(config);
  assert.equal(client.verifyIpn(signedIpn()).amount, 230000);
  assert.throws(() => client.verifyIpn({ ...signedIpn(), amount: 1 }));
  assert.throws(() =>
    client.verifyIpn({ ...signedIpn(), partnerCode: 'OTHER' }),
  );
  assert.throws(() => client.verifyIpn({ ...signedIpn(), signature: 'x' }));
  assert.throws(() =>
    client.verifyIpn({ ...signedIpn(), transId: Number.MAX_SAFE_INTEGER + 1 }),
  );
});

test('create uses sandbox, captureWallet, server URLs, exact signature and does not mean paid', async () => {
  let body;
  const response = {
    partnerCode: 'TEST',
    orderId: 'attempt-1',
    requestId: 'request-1',
    amount: 230000,
    responseTime: 1700000000000,
    message: 'Successful.',
    resultCode: 0,
    payUrl: 'https://test-payment.momo.vn/v2/gateway/pay?t=test',
  };
  response.signature = sign(
    `accessKey=access&amount=230000&message=Successful.&orderId=attempt-1&partnerCode=TEST&payUrl=${response.payUrl}&requestId=request-1&responseTime=1700000000000&resultCode=0`,
  );
  const client = new api.MomoSandboxClient(config, async (url, options) => {
    assert.equal(url, 'https://test-payment.momo.vn/v2/gateway/api/create');
    body = JSON.parse(options.body);
    return new Response(JSON.stringify(response));
  });
  const result = await client.create({
    orderId: 'attempt-1',
    requestId: 'request-1',
    amount: 230000,
    orderInfo: 'Rewear checkout',
  });
  assert.equal(body.autoCapture, true);
  assert.equal(body.requestType, 'captureWallet');
  assert.equal(
    body.signature,
    sign(
      'accessKey=access&amount=230000&extraData=&ipnUrl=https://merchant.test/api/payments/momo/ipn&orderId=attempt-1&orderInfo=Rewear checkout&partnerCode=TEST&redirectUrl=https://merchant.test/payment&requestId=request-1&requestType=captureWallet',
    ),
  );
  assert.equal(result.payUrl, response.payUrl);
  assert.equal(result.orderId, 'attempt-1');
});

test('transport errors remain unknown and expose no response body or credentials', async () => {
  const client = new api.MomoSandboxClient(
    config,
    async () => new Response('secret sensitive error', { status: 500 }),
  );
  await assert.rejects(
    client.query('attempt-1', 'query-1'),
    (error) =>
      error instanceof api.MomoTransportError &&
      !error.message.includes('secret'),
  );
});

test('query validates merchant and reference and signs its own unique request', async () => {
  const client = new api.MomoSandboxClient(config, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(
      body.signature,
      sign(
        'accessKey=access&orderId=attempt-1&partnerCode=TEST&requestId=query-1',
      ),
    );
    return Response.json({
      ...ipn,
      requestId: 'query-1',
      orderId: 'different',
    });
  });
  await assert.rejects(client.query('attempt-1', 'query-1'));
});

test('amount limits and configuration fail closed before any network call', async () => {
  let calls = 0;
  const client = new api.MomoSandboxClient(config, async () => {
    calls++;
    throw Error('unexpected');
  });
  for (const amount of [999, 50000001, 1000.1, NaN])
    await assert.rejects(
      client.create({
        orderId: 'a',
        requestId: 'b',
        amount,
        orderInfo: 'test',
      }),
    );
  assert.equal(calls, 0);
  assert.throws(() => new api.MomoSandboxClient({ ...config, secretKey: '' }));
  assert.throws(
    () => new api.MomoSandboxClient({ ...config, timeoutMs: 1000 }),
  );
});

test('refund uses a separate stable reference, original capture ID and documented signature', async () => {
  const client = new api.MomoSandboxClient(config, async (url, options) => {
    assert.equal(url, 'https://test-payment.momo.vn/v2/gateway/api/refund');
    const body = JSON.parse(options.body);
    assert.equal(body.transId, 123456);
    assert.equal(
      body.signature,
      sign(
        'accessKey=access&amount=230000&description=Rewear payment reversal&orderId=refund-1&partnerCode=TEST&requestId=refund-1&transId=123456',
      ),
    );
    return Response.json({
      partnerCode: 'TEST',
      orderId: 'refund-1',
      requestId: 'refund-1',
      amount: 230000,
      transId: 999999,
      resultCode: 0,
    });
  });
  assert.equal(
    (
      await client.refund({
        orderId: 'refund-1',
        requestId: 'refund-1',
        amount: 230000,
        transId: 123456,
      })
    ).resultCode,
    0,
  );
});

test('refund query success alone is insufficient without a matching successful refund entry', async () => {
  for (const entry of [
    [],
    [{ orderId: 'other', amount: 230000, resultCode: 0 }],
    [{ orderId: 'refund-1', amount: 230000, resultCode: 7000 }],
    [{ orderId: 'refund-1', amount: 220000, resultCode: 0 }],
  ]) {
    const client = new api.MomoSandboxClient(config, async () =>
      Response.json({
        partnerCode: 'TEST',
        orderId: 'refund-1',
        requestId: 'query-1',
        resultCode: 0,
        refundTrans: entry,
      }),
    );
    assert.equal(
      await client.queryRefund('refund-1', 'query-1', 230000),
      false,
    );
  }
});
