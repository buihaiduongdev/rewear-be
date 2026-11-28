import { createHmac, timingSafeEqual } from 'node:crypto';

import { PAYOS_STATUS } from './constants/payment.constant';

export interface MomoSettings {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  endpoint: string;
  redirectUrl: string;
  ipnUrl: string;
  timeoutMs: number;
}

export interface MomoCreatePaymentInput {
  orderId: string;
  requestId: string;
  amount: number;
  orderInfo: string;
  extraData?: string;
  requestType?: string;
}

export interface MomoCreatePaymentResult {
  orderId: string;
  requestId: string;
  resultCode: number;
  message: string;
  status: string;
  payUrl: string | null;
  qrCodeUrl: string | null;
  deeplink: string | null;
}

export interface MomoIpnPayload {
  partnerCode: string;
  orderId: string;
  requestId: string;
  amount: number;
  orderInfo: string;
  orderType: string;
  transId: number | string;
  resultCode: number;
  message: string;
  payType: string;
  responseTime: number | string;
  extraData: string;
  signature: string;
}

export interface MomoVerifiedIpn {
  orderId: string;
  requestId: string;
  amount: number;
  transId: string;
  resultCode: number;
  message: string;
  status: string;
}

export interface MomoQueryResult {
  orderId: string;
  requestId: string;
  amount: number;
  amountPaid: number;
  providerTransId: string | null;
  resultCode: number;
  message: string;
  status: string;
}

export interface MomoRefundInput {
  orderId: string;
  requestId: string;
  amount: number;
  transId: number;
  description: string;
}

export interface MomoRefundResult {
  orderId: string;
  requestId: string;
  amount: number;
  transId: string | null;
  resultCode: number;
  message: string;
  succeeded: boolean;
}

export class MomoTransportError extends Error {
  constructor() {
    super('MoMo result is unknown; reconcile before retrying');
  }
}

const MOMO_PENDING_CODES = new Set([1000, 7000, 7002, 9000]);

export function mapMomoResultCodeToStatus(resultCode: number): string {
  if (resultCode === 0) return PAYOS_STATUS.PAID;
  if (MOMO_PENDING_CODES.has(resultCode)) return PAYOS_STATUS.PENDING;
  return PAYOS_STATUS.FAILED;
}

export class MomoClient {
  private readonly settings: MomoSettings;
  private readonly fetcher: typeof fetch;

  constructor(settings: MomoSettings, fetcher: typeof fetch = fetch) {
    if (
      !settings.partnerCode ||
      !settings.accessKey ||
      !settings.secretKey ||
      !Number.isInteger(settings.timeoutMs) ||
      settings.timeoutMs < 5000
    ) {
      throw new Error('Invalid MoMo configuration');
    }
    for (const value of [
      settings.endpoint,
      settings.redirectUrl,
      settings.ipnUrl,
    ]) {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('MoMo URLs must use HTTP or HTTPS');
      }
    }
    this.settings = {
      ...settings,
      endpoint: settings.endpoint.replace(/\/+$/, ''),
    };
    this.fetcher = fetcher;
  }

  sign(rawData: string): string {
    return createHmac('sha256', this.settings.secretKey)
      .update(rawData)
      .digest('hex');
  }

  async createPayment(
    input: MomoCreatePaymentInput,
  ): Promise<MomoCreatePaymentResult> {
    this.assertAmount(input.amount);
    const orderId = input.orderId.trim();
    const requestId = input.requestId.trim();
    const orderInfo = input.orderInfo.trim().slice(0, 250);
    const extraData = input.extraData ?? '';
    const requestType = input.requestType ?? 'captureWallet';
    if (!orderId || !requestId || !orderInfo) {
      throw new Error('MoMo orderId, requestId, and orderInfo are required');
    }

    const rawSignature = [
      `accessKey=${this.settings.accessKey}`,
      `amount=${input.amount}`,
      `extraData=${extraData}`,
      `ipnUrl=${this.settings.ipnUrl}`,
      `orderId=${orderId}`,
      `orderInfo=${orderInfo}`,
      `partnerCode=${this.settings.partnerCode}`,
      `redirectUrl=${this.settings.redirectUrl}`,
      `requestId=${requestId}`,
      `requestType=${requestType}`,
    ].join('&');

    const body = {
      partnerCode: this.settings.partnerCode,
      requestId,
      amount: input.amount,
      orderId,
      orderInfo,
      redirectUrl: this.settings.redirectUrl,
      ipnUrl: this.settings.ipnUrl,
      lang: 'vi',
      extraData,
      requestType,
      signature: this.sign(rawSignature),
    };

    const data = await this.postJson('/v2/gateway/api/create', body);
    const resultCode = Number(data.resultCode);
    const payUrl = typeof data.payUrl === 'string' ? data.payUrl : null;
    if (resultCode === 0) {
      if (!payUrl) throw new MomoTransportError();
      const parsed = new URL(payUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new MomoTransportError();
      }
    }

    return {
      orderId: String(data.orderId ?? orderId),
      requestId: String(data.requestId ?? requestId),
      resultCode,
      message: String(data.message ?? ''),
      status: resultCode === 0 ? PAYOS_STATUS.PENDING : PAYOS_STATUS.FAILED,
      payUrl: resultCode === 0 ? payUrl : null,
      qrCodeUrl: typeof data.qrCodeUrl === 'string' ? data.qrCodeUrl : null,
      deeplink: typeof data.deeplink === 'string' ? data.deeplink : null,
    };
  }

  verifyIpnSignature(payload: MomoIpnPayload): MomoVerifiedIpn {
    if (payload.partnerCode !== this.settings.partnerCode) {
      throw new Error('Invalid MoMo IPN partnerCode');
    }
    if (
      !Number.isSafeInteger(payload.amount) ||
      payload.amount < 0 ||
      !payload.orderId ||
      !payload.requestId ||
      !payload.signature
    ) {
      throw new Error('Invalid MoMo IPN payload');
    }

    const rawSignature = [
      `accessKey=${this.settings.accessKey}`,
      `amount=${payload.amount}`,
      `extraData=${payload.extraData}`,
      `message=${payload.message}`,
      `orderId=${payload.orderId}`,
      `orderInfo=${payload.orderInfo}`,
      `orderType=${payload.orderType}`,
      `partnerCode=${payload.partnerCode}`,
      `payType=${payload.payType}`,
      `requestId=${payload.requestId}`,
      `responseTime=${payload.responseTime}`,
      `resultCode=${payload.resultCode}`,
      `transId=${payload.transId}`,
    ].join('&');

    const expected = Buffer.from(this.sign(rawSignature), 'utf8');
    const received = Buffer.from(
      payload.signature.trim().toLowerCase(),
      'utf8',
    );
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new Error('Invalid MoMo IPN signature');
    }

    const transId = String(payload.transId ?? '').trim();
    return {
      orderId: payload.orderId,
      requestId: payload.requestId,
      amount: payload.amount,
      transId: transId === '0' ? '' : transId,
      resultCode: payload.resultCode,
      message: payload.message,
      status: mapMomoResultCodeToStatus(payload.resultCode),
    };
  }

  async queryStatus(
    orderId: string,
    requestId: string,
  ): Promise<MomoQueryResult> {
    if (!orderId.trim() || !requestId.trim()) {
      throw new Error('MoMo orderId and requestId are required');
    }

    const rawSignature = [
      `accessKey=${this.settings.accessKey}`,
      `orderId=${orderId}`,
      `partnerCode=${this.settings.partnerCode}`,
      `requestId=${requestId}`,
    ].join('&');

    const data = await this.postJson('/v2/gateway/api/query', {
      partnerCode: this.settings.partnerCode,
      requestId,
      orderId,
      lang: 'vi',
      signature: this.sign(rawSignature),
    });

    const resultCode = Number(data.resultCode);
    const amount = Number(data.amount ?? 0);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new MomoTransportError();
    }
    const status = mapMomoResultCodeToStatus(resultCode);
    const rawTransId =
      data.transId !== undefined && data.transId !== null
        ? String(data.transId).trim()
        : '';

    return {
      orderId: String(data.orderId ?? orderId),
      requestId: String(data.requestId ?? requestId),
      amount,
      amountPaid: status === PAYOS_STATUS.PAID ? amount : 0,
      providerTransId: rawTransId && rawTransId !== '0' ? rawTransId : null,
      resultCode,
      message: String(data.message ?? ''),
      status,
    };
  }

  async refund(input: MomoRefundInput): Promise<MomoRefundResult> {
    this.assertAmount(input.amount);
    if (!Number.isSafeInteger(input.transId) || input.transId <= 0) {
      throw new Error('MoMo refund transId must be a positive safe integer');
    }
    const orderId = input.orderId.trim();
    const requestId = input.requestId.trim();
    const description = input.description.trim().slice(0, 250);
    if (!orderId || !requestId) {
      throw new Error('MoMo refund orderId and requestId are required');
    }

    const rawSignature = [
      `accessKey=${this.settings.accessKey}`,
      `amount=${input.amount}`,
      `description=${description}`,
      `orderId=${orderId}`,
      `partnerCode=${this.settings.partnerCode}`,
      `requestId=${requestId}`,
      `transId=${input.transId}`,
    ].join('&');

    const data = await this.postJson('/v2/gateway/api/refund', {
      partnerCode: this.settings.partnerCode,
      orderId,
      requestId,
      amount: input.amount,
      transId: input.transId,
      lang: 'vi',
      description,
      signature: this.sign(rawSignature),
    });

    const resultCode = Number(data.resultCode);
    const transId =
      data.transId !== undefined && data.transId !== null
        ? String(data.transId).trim()
        : null;

    return {
      orderId: String(data.orderId ?? orderId),
      requestId: String(data.requestId ?? requestId),
      amount: Number(data.amount ?? input.amount),
      transId: transId && transId !== '0' ? transId : null,
      resultCode,
      message: String(data.message ?? ''),
      succeeded: resultCode === 0,
    };
  }

  private async postJson(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      const response = await this.fetcher(`${this.settings.endpoint}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.settings.timeoutMs),
      });
      if (!response.ok) {
        throw new MomoTransportError();
      }
      const parsed: unknown = await response.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new MomoTransportError();
      }
      return parsed as Record<string, unknown>;
    } catch {
      // Do not leak provider response bodies or credentials in exceptions/logs.
      throw new MomoTransportError();
    }
  }

  private assertAmount(amount: number) {
    if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 500000000) {
      throw new Error('MoMo amount must be 1000–500000000 VND');
    }
  }
}
