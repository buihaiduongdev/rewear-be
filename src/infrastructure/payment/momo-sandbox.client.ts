import { createHmac, timingSafeEqual } from 'node:crypto';

export interface MomoSettings {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  ipnUrl: string;
  redirectUrl: string;
  timeoutMs: number;
}

export interface MomoNotification {
  partnerCode: string;
  orderId: string;
  requestId: string;
  amount: number;
  orderInfo: string;
  orderType: string;
  transId: number;
  resultCode: number;
  message: string;
  payType: string;
  responseTime: number;
  extraData: string;
  signature: string;
}

export interface MomoResult {
  partnerCode: string;
  orderId: string;
  requestId: string;
  amount: number;
  transId: number;
  resultCode: number;
  payUrl?: string;
}

export class MomoTransportError extends Error {
  constructor() {
    super('MoMo result is unknown; reconcile before retrying');
  }
}

// The transport is injected in tests; the endpoint cannot be changed to production.
export class MomoSandboxClient {
  private readonly settings: MomoSettings;
  private readonly transport: typeof fetch;

  constructor(settings: MomoSettings, transport: typeof fetch = fetch) {
    if (
      !settings.partnerCode ||
      !settings.accessKey ||
      !settings.secretKey ||
      !Number.isInteger(settings.timeoutMs) ||
      settings.timeoutMs < 30000
    )
      throw new Error('Invalid MoMo Sandbox configuration');
    for (const value of [settings.ipnUrl, settings.redirectUrl]) {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash)
        throw new Error('MoMo callback URLs must use HTTPS');
    }
    this.settings = settings;
    this.transport = transport;
  }

  private signature(fields: Record<string, string | number>): string {
    const raw = Object.keys(fields)
      .sort()
      .map((key) => `${key}=${fields[key]}`)
      .join('&');
    return createHmac('sha256', this.settings.secretKey)
      .update(raw)
      .digest('hex');
  }

  private matches(fields: Record<string, string | number>, signature: unknown) {
    if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature))
      return false;
    return timingSafeEqual(
      Buffer.from(this.signature(fields), 'hex'),
      Buffer.from(signature, 'hex'),
    );
  }

  verifyIpn(value: MomoNotification): MomoNotification {
    const keys = [
      'amount',
      'extraData',
      'message',
      'orderId',
      'orderInfo',
      'orderType',
      'partnerCode',
      'payType',
      'requestId',
      'responseTime',
      'resultCode',
      'transId',
    ] as const;
    const fields: Record<string, string | number> = {
      accessKey: this.settings.accessKey,
    };
    for (const key of keys) {
      const field = value?.[key];
      if (typeof field !== 'string' && typeof field !== 'number')
        throw new Error('Invalid MoMo notification');
      if (
        typeof field === 'number' &&
        (!Number.isSafeInteger(field) || field < 0)
      )
        throw new Error('Invalid MoMo notification');
      fields[key] = field;
    }
    if (
      value.partnerCode !== this.settings.partnerCode ||
      !this.matches(fields, value.signature)
    )
      throw new Error('Invalid MoMo signature');
    for (const key of [
      'amount',
      'transId',
      'resultCode',
      'responseTime',
    ] as const)
      if (!Number.isSafeInteger(value[key]))
        throw new Error('Invalid MoMo notification');
    return value;
  }

  async create(input: {
    orderId: string;
    requestId: string;
    amount: number;
    orderInfo: string;
  }): Promise<MomoResult> {
    this.assertAmount(input.amount);
    const fields = {
      accessKey: this.settings.accessKey,
      ...input,
      extraData: '',
      ipnUrl: this.settings.ipnUrl,
      partnerCode: this.settings.partnerCode,
      redirectUrl: this.settings.redirectUrl,
      requestType: 'captureWallet',
    };
    const { accessKey: _private, ...body } = fields;
    const data = await this.post('create', {
      ...body,
      autoCapture: true,
      lang: 'vi',
      signature: this.signature(fields),
    });
    const result = this.result(
      data,
      input.orderId,
      input.requestId,
      input.amount,
    );
    const payUrl = typeof data.payUrl === 'string' ? data.payUrl : '';
    if (
      !this.matches(
        {
          accessKey: this.settings.accessKey,
          amount: result.amount,
          message: this.text(data.message),
          orderId: result.orderId,
          partnerCode: result.partnerCode,
          payUrl,
          requestId: result.requestId,
          responseTime: this.integer(data.responseTime),
          resultCode: result.resultCode,
        },
        data.signature,
      )
    )
      throw new MomoTransportError();
    if (result.resultCode === 0) {
      const url = new URL(payUrl);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'test-payment.momo.vn' ||
        url.username ||
        url.password
      )
        throw new MomoTransportError();
      result.payUrl = payUrl;
    }
    return result;
  }

  async query(orderId: string, requestId: string): Promise<MomoResult> {
    const data = await this.queryRequest('query', orderId, requestId);
    return this.result(data, orderId, requestId);
  }

  async refund(input: {
    orderId: string;
    requestId: string;
    amount: number;
    transId: number;
  }): Promise<MomoResult> {
    this.assertAmount(input.amount);
    const fields = {
      accessKey: this.settings.accessKey,
      ...input,
      description: 'Rewear payment reversal',
      partnerCode: this.settings.partnerCode,
    };
    const { accessKey: _private, ...body } = fields;
    return this.result(
      await this.post('refund', {
        ...body,
        lang: 'vi',
        signature: this.signature(fields),
      }),
      input.orderId,
      input.requestId,
      input.amount,
    );
  }

  async queryRefund(
    orderId: string,
    requestId: string,
    amount: number,
  ): Promise<boolean> {
    const data = await this.queryRequest('refund/query', orderId, requestId);
    if (
      data.partnerCode !== this.settings.partnerCode ||
      data.orderId !== orderId ||
      data.requestId !== requestId ||
      data.resultCode !== 0
    )
      return false;
    if (!Array.isArray(data.refundTrans)) return false;
    return data.refundTrans.some(
      (entry: Record<string, unknown>) =>
        entry.orderId === orderId &&
        entry.resultCode === 0 &&
        entry.amount === amount,
    );
  }

  private async queryRequest(
    endpoint: string,
    orderId: string,
    requestId: string,
  ) {
    const fields = {
      accessKey: this.settings.accessKey,
      orderId,
      partnerCode: this.settings.partnerCode,
      requestId,
    };
    const { accessKey: _private, ...body } = fields;
    return this.post(endpoint, {
      ...body,
      lang: 'vi',
      signature: this.signature(fields),
    });
  }

  private async post(
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      const response = await this.transport(
        `https://test-payment.momo.vn/v2/gateway/api/${endpoint}`,
        {
          method: 'POST',
          redirect: 'error',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.settings.timeoutMs),
        },
      );
      if (!response.ok) throw new MomoTransportError();
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new MomoTransportError();
      return data as Record<string, unknown>;
    } catch {
      // Do not leak provider response bodies, credentials, or signatures in logs.
      throw new MomoTransportError();
    }
  }

  private result(
    data: Record<string, unknown>,
    orderId: string,
    requestId: string,
    amount?: number,
  ): MomoResult {
    if (
      data.partnerCode !== this.settings.partnerCode ||
      data.orderId !== orderId ||
      data.requestId !== requestId
    )
      throw new MomoTransportError();
    const result = {
      partnerCode: this.settings.partnerCode,
      orderId,
      requestId,
      amount: this.integer(data.amount),
      transId: data.transId === undefined ? 0 : this.integer(data.transId),
      resultCode: this.integer(data.resultCode),
    };
    if (amount !== undefined && result.amount !== amount)
      throw new MomoTransportError();
    if (result.resultCode === 0 && amount === undefined && !result.transId)
      throw new MomoTransportError();
    return result;
  }

  private integer(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
      throw new MomoTransportError();
    return value;
  }

  private text(value: unknown): string {
    if (typeof value !== 'string') throw new MomoTransportError();
    return value;
  }

  private assertAmount(amount: number) {
    if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 50000000)
      throw new Error('MoMo amount must be 1000–50000000 VND');
  }
}
