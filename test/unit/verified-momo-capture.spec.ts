import type { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import type { Order } from '@/modules/order/entities/order.entity';
import { PaymentAttempt } from '@/modules/payment/entities/payment.entity';
import { verifiedMomoCapture } from '@/modules/payment/verified-momo-capture';
import { WalletCredit } from '@/modules/wallet/entities/wallet.entity';
import { WalletService } from '@/modules/wallet/wallet.service';

describe('verified MoMo capture', () => {
  function fixture() {
    const items = [{ productId: 'item', price: 10000, coinDiscount: 1000 }];
    const address = { recipientName: 'Buyer' };
    const order = {
      id: 'order',
      paymentMethod: 'MOMO',
      paymentId: 'payment',
      checkoutId: 'checkout',
      checkoutOrderId: 'snapshot',
      buyerId: 'buyer',
      shopId: 'shop',
      commissionBasisPoints: 300,
      subtotal: 10000,
      shippingFee: 2000,
      total: 11000,
      coinDiscount: 1000,
      coinMode: 'SIMULATION',
      items,
      address,
    } as unknown as Order;
    const payment = {
      id: 'payment',
      state: 'PAID',
      providerTransId: '123',
      paidAt: new Date(),
      capturedAmount: 11000,
      amount: 11000,
      buyerId: 'buyer',
      checkoutId: 'checkout',
      orders: [
        {
          checkoutOrderId: 'snapshot',
          shopId: 'shop',
          subtotal: 10000,
          shippingFee: 2000,
          coinDiscount: 1000,
          coinMode: 'SIMULATION',
          items,
          address,
        },
      ],
    };
    const checkout = { status: 'PAID', buyerId: 'buyer' };
    const manager = {
      findOneBy: jest.fn(async (entity) =>
        entity === PaymentAttempt ? payment : checkout,
      ),
      existsBy: jest.fn(async () => false),
    };
    return {
      order,
      payment,
      checkout,
      manager: manager as unknown as EntityManager,
      raw: manager,
    };
  }
  it('proves exact net cash plus immutable coin and item snapshots', async () => {
    const f = fixture();
    expect(await verifiedMomoCapture(f.manager, f.order)).toBe(f.payment);
  });
  it.each([
    'amount',
    'state',
    'buyer',
    'discount',
    'mode',
    'items',
    'address',
    'refund',
  ])('rejects %s tampering', async (field) => {
    const f = fixture();
    if (field === 'amount') f.payment.capturedAmount = 10000;
    if (field === 'state') f.payment.state = 'UNKNOWN';
    if (field === 'buyer') f.payment.buyerId = 'another';
    if (field === 'discount') f.order.coinDiscount = 999;
    if (field === 'mode') f.order.coinMode = 'EVIDENCE';
    if (field === 'items')
      f.order.items = [{ ...f.order.items[0], price: 9999 }];
    if (field === 'address')
      f.order.address = { ...f.order.address, recipientName: 'Other' };
    if (field === 'refund') f.raw.existsBy.mockResolvedValue(true);
    expect(await verifiedMomoCapture(f.manager, f.order)).toBeNull();
  });
  it('cancellation rejects a MoMo label without capture before crediting any wallet', async () => {
    const f = fixture();
    f.order.paymentId = null;
    const manager = { ...f.raw, query: jest.fn(async () => []) };
    await expect(
      new WalletService({} as DataSource).creditCancellation(
        manager as unknown as EntityManager,
        f.order,
      ),
    ).rejects.toThrow('payment source');
  });
  it('cancellation replay rejects a credit moved into another mode', async () => {
    const f = fixture();
    f.order.coinDiscount = 0;
    f.order.coinMode = null;
    f.order.total = 12000;
    f.payment.amount = 12000;
    f.payment.capturedAmount = 12000;
    f.payment.orders[0].coinDiscount = 0;
    Object.assign(f.payment.orders[0], { coinMode: null });
    const manager = {
      query: jest.fn(async () => []),
      existsBy: jest.fn(async () => false),
      findOneBy: jest.fn(async (entity: unknown) =>
        entity === PaymentAttempt
          ? f.payment
          : entity === WalletCredit
            ? { userId: 'buyer', amount: 12000, mode: 'EVIDENCE' }
            : f.checkout,
      ),
    };
    await expect(
      new WalletService({} as DataSource).creditCancellation(
        manager as unknown as EntityManager,
        f.order,
      ),
    ).rejects.toThrow('Refund ledger');
  });
  it('does not infer paid money from paymentMethod alone', async () => {
    const f = fixture();
    f.order.paymentId = null;
    expect(await verifiedMomoCapture(f.manager, f.order)).toBeNull();
    expect(f.raw.findOneBy).not.toHaveBeenCalled();
  });
});
