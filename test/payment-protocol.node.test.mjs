import assert from 'node:assert/strict';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const payosUrl = pathToFileURL(require.resolve('@payos/node')).href;
const source = (
  await readFile(
    new URL('../src/infrastructure/payment/payos.client.ts', import.meta.url),
    'utf8',
  )
).replace("from '@payos/node'", `from '${payosUrl}'`);
const api = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`
);

const config = {
  clientId: 'client-id',
  apiKey: 'api-key',
  checksumKey: 'checksum-key',
  returnUrl: 'https://merchant.test/payment-result',
  cancelUrl: 'https://merchant.test/payment-cancel',
  timeoutMs: 30000,
};

test('generatePayosOrderCode returns positive safe integers', () => {
  const code = api.generatePayosOrderCode();
  assert.ok(Number.isSafeInteger(code) && code > 0);
});

test('createPaymentLink enforces server return/cancel URLs, trims description, and checks checkoutUrl', async () => {
  let sent;
  const sdk = {
    paymentRequests: {
      create: async (payload) => {
        sent = payload;
        return {
          orderCode: payload.orderCode,
          paymentLinkId: 'plink-1',
          status: 'PENDING',
          checkoutUrl: 'https://pay.payos.vn/web/plink-1',
          qrCode: '000201...',
        };
      },
    },
    webhooks: {},
  };
  const client = new api.PayosClient(config, sdk);
  const result = await client.createPaymentLink({
    orderCode: 1700000000123,
    amount: 230000,
    description: 'Rewear order #1234567890 extra text trimmed',
    expiredAt: 1700000600,
  });
  assert.equal(sent.returnUrl, config.returnUrl);
  assert.equal(sent.cancelUrl, config.cancelUrl);
  assert.equal(sent.description.length, 25);
  assert.equal(result.checkoutUrl, 'https://pay.payos.vn/web/plink-1');
  assert.equal(result.status, 'PENDING');
});

test('getPaymentLink extracts bank reference as providerTransId and sanitizes SDK errors', async () => {
  const failing = new api.PayosClient(
    config,
    {
      paymentRequests: {
        get: async () => {
          throw new Error('secret api-key failure');
        },
      },
      webhooks: {},
    },
  );
  await assert.rejects(
    failing.getPaymentLink(1700000000123),
    (error) =>
      error instanceof api.PayosTransportError &&
      !error.message.includes('secret'),
  );

  const paid = new api.PayosClient(config, {
    paymentRequests: {
      get: async () => ({
        id: 'plink-1',
        orderCode: 1700000000123,
        amount: 230000,
        amountPaid: 230000,
        amountRemaining: 0,
        status: 'PAID',
        transactions: [{ reference: 'FT240012345' }],
      }),
    },
    webhooks: {},
  });
  const info = await paid.getPaymentLink(1700000000123);
  assert.equal(info.status, 'PAID');
  assert.equal(info.providerTransId, 'FT240012345');
});

test('verifyWebhook detects test ping and rejects invalid payloads or tampered fields', async () => {
  const client = new api.PayosClient(config, {
    paymentRequests: {},
    webhooks: {
      verify: async (payload) => {
        if (payload.signature !== 'valid') throw new Error('Invalid checksum');
        return payload.data;
      },
    },
  });
  const ping = await client.verifyWebhook({
    code: '00',
    desc: 'success',
    signature: 'valid',
    data: {
      orderCode: 123,
      amount: 2000,
      description: 'Ma giao dich thu nghiem',
      reference: 'TF2302042130',
      paymentLinkId: '123',
      code: '00',
      desc: 'success',
    },
  });
  assert.equal(ping.isTestPing, true);

  await assert.rejects(
    client.verifyWebhook({ signature: 'bad', data: {} }),
    /Invalid PayOS webhook/,
  );
  await assert.rejects(
    client.verifyWebhook({
      signature: 'valid',
      data: { orderCode: -1, amount: 2000, reference: 'FT1' },
    }),
    /Invalid PayOS webhook/,
  );
});

test('amount limits and configuration fail closed before any SDK call', async () => {
  let calls = 0;
  const client = new api.PayosClient(config, {
    paymentRequests: {
      create: async () => {
        calls++;
        throw Error('unexpected');
      },
    },
    webhooks: {},
  });
  for (const amount of [1999, 500000001, 2000.5, NaN]) {
    await assert.rejects(
      client.createPaymentLink({
        orderCode: 1700000000123,
        amount,
        description: 'Test',
      }),
    );
  }
  assert.equal(calls, 0);
  assert.throws(() => new api.PayosClient({ ...config, checksumKey: '' }));
  assert.throws(() => new api.PayosClient({ ...config, timeoutMs: 1000 }));
});
