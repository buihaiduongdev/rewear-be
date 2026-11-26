import { randomUUID } from 'node:crypto';

import type { DataSource, EntityManager } from 'typeorm';

import { CodService } from '@/modules/cod/cod.service';
import { COD_RESTRICTION_CAUSE } from '@/modules/cod/constants/cod.constant';
import { CodRestriction } from '@/modules/cod/entities';
import { CodPolicy } from '@/modules/cod/policies/cod.policy';
import { Order } from '@/modules/order/entities';
import type { OrderService } from '@/modules/order/order.service';
import type { PaymentPricing } from '@/modules/payment/payment.pricing';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';
import { readPayoutSources } from '@/modules/shop-finance/payout-sources';
import { SHOP_LEDGER_ENTRY_TYPE } from '@/modules/shop-finance/payouts/constants/payout.constant';
import { ShopFinanceService } from '@/modules/shop-finance/shop-finance.service';

describe('FEAT-07 COD failure handling without fee subsystem', () => {
  it('records a clean idempotent 2-way shipping debit in ShopLedger for seller-fault COD failure', async () => {
    const saved: ShopLedgerEntry[] = [];
    const manager = {
      findOneBy: jest.fn(
        async (_entity, where: Record<string, unknown>) =>
          saved.find(
            (row) => row.orderId === where.orderId && row.type === where.type,
          ) ?? null,
      ),
      create: jest.fn((_entity, data) => ({ id: randomUUID(), ...data })),
      save: jest.fn(async (_entity, row) => {
        saved.push(row);
        return row;
      }),
    } as unknown as EntityManager;

    const service = new ShopFinanceService({} as DataSource);
    const order = {
      id: randomUUID(),
      shopId: randomUUID(),
      shippingFee: 30000,
    };

    const first = await service.recordCodShippingDebit(
      manager,
      order,
      32000,
      'EVIDENCE',
      'admin-1',
    );
    const replay = await service.recordCodShippingDebit(
      manager,
      order,
      32000,
      'EVIDENCE',
      'admin-1',
    );

    expect(first?.id).toBe(replay?.id);
    expect(first).toMatchObject({
      shopId: order.shopId,
      orderId: order.id,
      type: SHOP_LEDGER_ENTRY_TYPE.COD_SHIPPING_DEBIT,
      mode: 'EVIDENCE',
      amount: 64000,
    });
    expect(saved).toHaveLength(1);
    await expect(
      service.recordCodShippingDebit(manager, order, 30000, 'EVIDENCE'),
    ).rejects.toThrow('reconciliation');
  });

  it('blocks new COD orders via CodRestriction on buyer-fault failed COD delivery', async () => {
    const restrictions: CodRestriction[] = [];
    const now = new Date('2026-11-25T10:00:00.000Z');
    const manager = {
      find: jest.fn(async (entity) =>
        entity === CodRestriction ? restrictions : [],
      ),
      create: jest.fn((_entity, data) => ({ id: randomUUID(), ...data })),
      save: jest.fn(async (_entity, row) => {
        restrictions.push(row);
        return row;
      }),
    } as unknown as EntityManager;

    const policy = new CodPolicy({} as DataSource);
    const buyerId = randomUUID();
    const created = await policy.recordFailedDelivery(
      manager,
      { buyerId },
      now,
    );

    expect(created).toMatchObject({
      buyerId,
      cause: COD_RESTRICTION_CAUSE.FAILED_DELIVERY,
    });
    expect(created.blockedUntil?.getTime()).toBe(
      now.getTime() + 24 * 60 * 60 * 1000,
    );
    await expect(
      policy.assertCanPlace(manager, buyerId, 1, now),
    ).rejects.toThrow('COD is temporarily restricted');
  });

  it('deducts shippingDebit from unpaid available settlements without letting already-paid settlements absorb it', async () => {
    const s1 = randomUUID();
    const s2 = randomUUID();
    const manager = {
      query: jest.fn(async () => [
        {
          kind: 'SETTLEMENT',
          sourceId: s1,
          orderId: randomUUID(),
          net: 100000,
          paid: 100000,
          reserved: 0,
          blocked: false,
        },
        {
          kind: 'SETTLEMENT',
          sourceId: s2,
          orderId: randomUUID(),
          net: 100000,
          paid: 0,
          reserved: 0,
          blocked: false,
        },
      ]),
      sum: jest.fn(async () => 40000),
    } as unknown as EntityManager;

    const funds = await readPayoutSources(manager, randomUUID(), 'EVIDENCE');
    expect(funds.available).toBe(60000);
    expect(funds.paidOut).toBe(100000);
    expect(funds.paidOutDebt).toBe(0);
    expect(funds.shippingDebit).toBe(40000);
    expect(funds.sources).toEqual([
      expect.objectContaining({ sourceId: s2, amount: 60000 }),
    ]);
  });

  it('passes cancellationNote before release and replays idempotently', async () => {
    const adminId = randomUUID();
    const order: Partial<Order> = {
      id: randomUUID(),
      buyerId: randomUUID(),
      shopId: randomUUID(),
      paymentMethod: 'COD',
      status: 'returns',
      shippingFee: 30000,
      cancellationReason: null,
      cancellationNote: null,
    };
    const shipment: Partial<Shipment> = {
      orderId: order.id,
      carrierFee: 32000,
      nextQueryAt: new Date(),
    };
    const manager = {
      findOneOrFail: jest.fn(async (entity) =>
        entity === Order ? order : shipment,
      ),
      query: jest.fn(async () => [{ now: new Date('2026-11-26T00:00:00Z') }]),
    } as unknown as EntityManager;
    const observedNotes: (string | null | undefined)[] = [];
    const orderService = {
      releaseCodReturnedVerified: jest.fn(
        async (
          _m: EntityManager,
          target: Order,
          _now: Date,
          _sellable: boolean,
          actorId: string | null,
        ) => {
          observedNotes.push(target.cancellationNote);
          expect(actorId).toBe(adminId);
          target.status = 'cancelled';
          target.cancellationReason = 'CARRIER_RETURNED';
        },
      ),
    } as unknown as OrderService;
    const shopFinance = {
      recordCodShippingDebit: jest.fn(async () => null),
    } as unknown as ShopFinanceService;
    const service = new CodService(
      {
        transaction: (fn: (m: EntityManager) => unknown) => fn(manager),
      } as unknown as DataSource,
      {} as PaymentPricing,
      {} as CodPolicy,
      { record: jest.fn() } as never,
      {} as never,
      orderService,
      shopFinance,
    );

    const payload = {
      fault: 'SELLER' as const,
      mode: 'SIMULATION' as const,
      sellable: true,
      reason: 'Wrong size packed',
    };
    await service.resolveReturnedOrder(adminId, order.id!, payload);
    const replay = await service.resolveReturnedOrder(
      adminId,
      order.id!,
      payload,
    );
    expect(replay.status).toBe('cancelled');
    expect(observedNotes).toEqual(['Wrong size packed']);
    expect(orderService.releaseCodReturnedVerified).toHaveBeenCalledTimes(1);
    expect(shopFinance.recordCodShippingDebit).toHaveBeenCalledTimes(1);
  });
});
