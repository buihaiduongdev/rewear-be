import { randomInt } from 'node:crypto';

import {
  type PaymentLinkStatus,
  PayOS,
  type Webhook,
  type WebhookData,
} from '@payos/node';

export interface PayosSettings {
  clientId: string;
  apiKey: string;
  checksumKey: string;
  returnUrl: string;
  cancelUrl: string;
  timeoutMs: number;
}

export type PayosPaymentStatus = PaymentLinkStatus;

export interface PayosCreateResult {
  orderCode: number;
  paymentLinkId: string;
  status: PayosPaymentStatus;
  checkoutUrl: string;
  qrCode: string;
}

export interface PayosPaymentTransaction {
  providerTransId: string;
  amount: number;
}

export interface PayosPaymentResult {
  orderCode: number;
  status: PayosPaymentStatus;
  amount: number;
  amountPaid: number;
  providerTransId: string | null;
  transactions?: PayosPaymentTransaction[];
}

export function isIncludedInAggregateTransId(
  aggregateId: string | null | undefined,
  providerTransId: string,
): boolean {
  if (!aggregateId || !providerTransId || !aggregateId.startsWith('plink:')) {
    return false;
  }
  return aggregateId
    .slice('plink:'.length)
    .split('+')
    .includes(providerTransId);
}

export interface PayosWebhookResult {
  orderCode: number;
  amount: number;
  code: string;
  desc: string;
  reference: string;
  paymentLinkId: string;
  description: string;
  isTestPing: boolean;
}

export class PayosTransportError extends Error {
  constructor() {
    super('PayOS result is unknown; reconcile before retrying');
  }
}

export function generatePayosOrderCode(): number {
  return Date.now() * 1000 + randomInt(1000);
}

type PayosSdkLike = Pick<PayOS, 'paymentRequests' | 'webhooks'>;

export class PayosClient {
  private readonly settings: PayosSettings;
  private readonly sdk: PayosSdkLike;

  constructor(settings: PayosSettings, sdk?: PayosSdkLike) {
    if (
      !settings.clientId ||
      !settings.apiKey ||
      !settings.checksumKey ||
      !Number.isInteger(settings.timeoutMs) ||
      settings.timeoutMs < 5000
    ) {
      throw new Error('Invalid PayOS configuration');
    }
    for (const value of [settings.returnUrl, settings.cancelUrl]) {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('PayOS redirect URLs must use HTTP or HTTPS');
      }
    }
    this.settings = settings;
    this.sdk =
      sdk ??
      new PayOS({
        clientId: settings.clientId,
        apiKey: settings.apiKey,
        checksumKey: settings.checksumKey,
        timeout: settings.timeoutMs,
      });
  }

  async createPaymentLink(input: {
    orderCode: number;
    amount: number;
    description: string;
    expiredAt?: number;
  }): Promise<PayosCreateResult> {
    this.assertOrderCode(input.orderCode);
    this.assertAmount(input.amount);
    const description = input.description.trim().slice(0, 25);
    if (!description) throw new Error('PayOS description is required');

    try {
      const response = await this.sdk.paymentRequests.create({
        orderCode: input.orderCode,
        amount: input.amount,
        description,
        returnUrl: this.settings.returnUrl,
        cancelUrl: this.settings.cancelUrl,
        ...(input.expiredAt !== undefined
          ? { expiredAt: input.expiredAt }
          : {}),
      });
      const checkoutUrl = new URL(response.checkoutUrl);
      if (
        checkoutUrl.protocol !== 'https:' &&
        checkoutUrl.protocol !== 'http:'
      ) {
        throw new PayosTransportError();
      }
      return {
        orderCode: response.orderCode,
        paymentLinkId: response.paymentLinkId,
        status: response.status,
        checkoutUrl: response.checkoutUrl,
        qrCode: response.qrCode,
      };
    } catch {
      // Do not leak provider response bodies or credentials in exceptions/logs.
      throw new PayosTransportError();
    }
  }

  async getPaymentLink(orderCode: number): Promise<PayosPaymentResult> {
    this.assertOrderCode(orderCode);
    try {
      const info = await this.sdk.paymentRequests.get(orderCode);
      if (
        info.orderCode !== orderCode ||
        !Number.isSafeInteger(info.amount) ||
        info.amount < 0 ||
        !Number.isSafeInteger(info.amountPaid) ||
        info.amountPaid < 0
      ) {
        throw new PayosTransportError();
      }
      const transactions: PayosPaymentTransaction[] = [];
      const refs: string[] = [];
      for (const tx of info.transactions ?? []) {
        const ref = typeof tx.reference === 'string' ? tx.reference.trim() : '';
        if (!ref) continue;
        refs.push(ref);
        if (Number.isSafeInteger(tx.amount) && tx.amount > 0) {
          transactions.push({ providerTransId: ref, amount: tx.amount });
        }
      }
      const providerTransId =
        refs.length > 1
          ? `plink:${refs.join('+')}`.slice(0, 64)
          : refs[0] || (info.id ? String(info.id) : null);
      return {
        orderCode: info.orderCode,
        status: info.status,
        amount: info.amount,
        amountPaid: info.amountPaid,
        providerTransId,
        ...(transactions.length > 0 ? { transactions } : {}),
      };
    } catch {
      throw new PayosTransportError();
    }
  }

  async verifyWebhook(body: unknown): Promise<PayosWebhookResult> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Invalid PayOS webhook');
    }
    let verified: WebhookData;
    try {
      verified = await this.sdk.webhooks.verify(body as Webhook);
    } catch {
      throw new Error('Invalid PayOS webhook');
    }
    if (
      !Number.isSafeInteger(verified.orderCode) ||
      verified.orderCode <= 0 ||
      !Number.isSafeInteger(verified.amount) ||
      verified.amount < 0 ||
      typeof verified.reference !== 'string'
    ) {
      throw new Error('Invalid PayOS webhook');
    }
    return {
      orderCode: verified.orderCode,
      amount: verified.amount,
      code: verified.code,
      desc: verified.desc,
      reference: verified.reference.trim(),
      paymentLinkId: verified.paymentLinkId ?? '',
      description: verified.description ?? '',
      isTestPing: verified.orderCode === 123,
    };
  }

  private assertOrderCode(orderCode: number) {
    if (!Number.isSafeInteger(orderCode) || orderCode <= 0) {
      throw new Error('PayOS orderCode must be a positive safe integer');
    }
  }

  private assertAmount(amount: number) {
    if (!Number.isSafeInteger(amount) || amount < 2000 || amount > 500000000) {
      throw new Error('PayOS amount must be 2000–500000000 VND');
    }
  }
}
