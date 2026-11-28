import { randomUUID } from 'node:crypto';

import { GhnShipmentClient } from '@/infrastructure/shipping/clients/ghn-shipment.client';
import { AuthProvider } from '@/modules/auth/enums';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { CodReconciliationService } from '@/modules/cod-reconciliation/cod-reconciliation.service';
import {
  CodCollection,
  CodRemittance,
} from '@/modules/cod-reconciliation/entities';
import {
  CollectionInput,
  RemittanceInput,
} from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { CodPolicy } from '@/modules/cod/policies/cod.policy';
import { CoinService } from '@/modules/coins/coin.service';
import { OutboxService } from '@/modules/event/outbox.service';
import { Order } from '@/modules/order/entities';
import { OrderService } from '@/modules/order/order.service';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { ShipmentService } from '@/modules/shipment/shipment.service';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';
import { ShopFinanceService } from '@/modules/shop-finance/shop-finance.service';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserStatus } from '@/modules/user/enums';
import { WalletService } from '@/modules/wallet/wallet.service';

import { createTestDatabase, TestDatabase } from '../support/database';

describe('COD actual receipt and Shop held subledger (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: CodReconciliationService;
  let finance: ShopFinanceService;
  const adminId = randomUUID();
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new CodReconciliationService(
      database.dataSource,
      new CoinService(database.dataSource),
    );
    finance = new ShopFinanceService(database.dataSource);
  });
  afterAll(async () => database?.destroy());
  async function fixture() {
    const db = database.dataSource;
    const owner = await db.getRepository(User).save({
      email: `${randomUUID()}@test.local`,
      fullName: 'Owner',
      provider: AuthProvider.CREDENTIALS,
      status: UserStatus.ACTIVE,
    });
    const shop = await db.getRepository(Shop).save({ name: 'Test Shop' });
    await db.getRepository(ShopMember).save({
      shopId: shop.id,
      userId: owner.id,
      memberRole: ShopMemberRole.OWNER,
    });
    const order = await db.getRepository(Order).save({
      checkoutOrderId: randomUUID(),
      buyerId: owner.id,
      shopId: shop.id,
      shopName: shop.name,
      paymentMethod: 'COD',
      status: 'delivered',
      subtotal: 200000,
      shippingFee: 30000,
      total: 230000,
      commissionBasisPoints: 300,
      createdAt: new Date(Date.now() - 7200000),
      sellerConfirmBy: new Date(),
      deliveryObservedAt: new Date(Date.now() - 3600000),
      address: {},
      items: [
        {
          productId: randomUUID(),
          title: 'Jacket',
          price: 200000,
          size: null,
          condition: 'GOOD',
          coverUrl: null,
          shippingPackage: null,
        },
      ],
    });
    const shipment = await db.getRepository(Shipment).save({
      orderId: order.id,
      state: 'BOOKED',
      orderCode: randomUUID(),
      payload: {},
      input: {} as Shipment['input'],
      quotedParcel: {} as Shipment['quotedParcel'],
      codAmount: 230000,
      providerStatus: 'delivered',
      pickedObservedAt: new Date(Date.now() - 4000000),
    });
    const input: CollectionInput = {
      mode: 'EVIDENCE',
      waybillCode: shipment.orderCode!,
      collectedAmount: 230000,
      approvedCarrierFee: 32000,
      collectedAt: new Date(Date.now() - 60000).toISOString(),
      reason: 'Reconciled carrier statement',
      evidence: 'Carrier receipt and verified waybill',
    };
    return { db, owner, shop, order, shipment, input };
  }
  function receipt(
    orderId: string,
    cashAmount: number,
    feeDeducted = 0,
    mode: RemittanceInput['mode'] = 'EVIDENCE',
  ): RemittanceInput {
    return {
      reference: randomUUID(),
      mode,
      netAmount: cashAmount,
      receivedAt: new Date(Date.now() - 1000).toISOString(),
      reason: 'Bank and carrier settlement matched',
      evidence: 'Verified transaction receipt',
      allocations: [{ orderId, cashAmount, feeDeducted }],
    };
  }

  it('records collection as receivable, never treats delivered/collection as platform cash', async () => {
    const f = await fixture();
    const row = await service.recordCollection(adminId, f.order.id, f.input);
    expect(row.status).toBe('AWAITING');
    expect(row.sellerNet).toBe(194000);
    const view = await finance.view(f.owner.id, f.shop.id, {});
    expect(view.held).toBe(0);
    expect(view.available).toBe(0);
    expect(view.receivable).toBe(194000);
    expect(
      await f.db
        .getRepository(ShopLedgerEntry)
        .countBy({ orderId: f.order.id }),
    ).toBe(0);
  });
  it('net-reconciles partial transfers and credits held exactly once only on full gross receipt', async () => {
    const f = await fixture();
    await service.recordCollection(adminId, f.order.id, f.input);
    const first = receipt(f.order.id, 100000, 32000);
    await service.recordRemittance(adminId, first);
    expect((await service.detail(f.order.id)).collection.status).toBe(
      'PARTIAL',
    );
    expect((await finance.view(f.owner.id, f.shop.id, {})).held).toBe(0);
    const final = receipt(f.order.id, 98000);
    const [a, b] = await Promise.all([
      service.recordRemittance(adminId, final),
      service.recordRemittance(adminId, final),
    ]);
    expect(a.id).toBe(b.id);
    const view = await finance.view(f.owner.id, f.shop.id, {});
    expect(view.held).toBe(194000);
    expect(view.available).toBe(0);
    expect(view.receivable).toBe(0);
    const row = (await service.detail(f.order.id)).collection;
    expect(row.cashReceived).toBe(198000);
    expect(row.feeDeducted).toBe(32000);
    expect(row.status).toBe('FUNDED_HELD');
    expect(
      await f.db
        .getRepository(ShopLedgerEntry)
        .countBy({ orderId: f.order.id }),
    ).toBe(1);
  });
  it('rejects transfer reuse across request IDs/orders without allocating money twice', async () => {
    const a = await fixture(),
      b = await fixture();
    await service.recordCollection(adminId, a.order.id, a.input);
    await service.recordCollection(adminId, b.order.id, b.input);
    const paid = receipt(a.order.id, 230000);
    await service.recordRemittance(adminId, paid);
    await expect(
      service.recordRemittance(adminId, {
        ...receipt(b.order.id, 230000),
        reference: `  ${paid.reference.toLowerCase()}  `,
      }),
    ).rejects.toThrow('already');
    expect((await finance.view(b.owner.id, b.shop.id, {})).held).toBe(0);
  });
  it('rejects over-allocation, fee over-cap and unequal cash sum atomically', async () => {
    const f = await fixture();
    await service.recordCollection(adminId, f.order.id, f.input);
    await expect(
      service.recordRemittance(adminId, receipt(f.order.id, 198000, 32001)),
    ).rejects.toThrow('fee');
    await expect(
      service.recordRemittance(adminId, receipt(f.order.id, 230001)),
    ).rejects.toThrow('collection');
    await expect(
      service.recordRemittance(adminId, {
        ...receipt(f.order.id, 100),
        netAmount: 101,
      }),
    ).rejects.toThrow('Net amount');
    expect(
      await f.db
        .getRepository(ShopLedgerEntry)
        .countBy({ orderId: f.order.id }),
    ).toBe(0);
    expect((await service.detail(f.order.id)).collection.cashReceived).toBe(0);
  });
  it('does not overspend collection when competing distinct transfers race', async () => {
    const f = await fixture();
    await service.recordCollection(adminId, f.order.id, f.input);
    const results = await Promise.allSettled([
      service.recordRemittance(adminId, receipt(f.order.id, 150000)),
      service.recordRemittance(adminId, receipt(f.order.id, 150000)),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect((await service.detail(f.order.id)).collection.cashReceived).toBe(
      150000,
    );
  });
  it.each([180000, 250000])(
    'keeps short/excess collection %i under review, with actual receipts but no Shop credit',
    async (amount) => {
      const f = await fixture();
      const row = await service.recordCollection(adminId, f.order.id, {
        ...f.input,
        collectedAmount: amount,
      });
      expect(row.status).toBe('REVIEW');
      await service.recordRemittance(adminId, receipt(f.order.id, amount));
      expect((await service.detail(f.order.id)).collection.status).toBe(
        'REVIEW',
      );
      expect((await finance.view(f.owner.id, f.shop.id, {})).held).toBe(0);
    },
  );
  it('separates simulation balances and refuses mixing real evidence with simulation allocations', async () => {
    const f = await fixture();
    await service.recordCollection(adminId, f.order.id, {
      ...f.input,
      mode: 'SIMULATION',
    });
    await expect(
      service.recordRemittance(adminId, receipt(f.order.id, 230000)),
    ).rejects.toThrow('mode');
    await service.recordRemittance(
      adminId,
      receipt(f.order.id, 230000, 0, 'SIMULATION'),
    );
    expect((await finance.view(f.owner.id, f.shop.id, {})).held).toBe(0);
    const simulated = await finance.view(f.owner.id, f.shop.id, {
      mode: 'SIMULATION',
    });
    expect(simulated.mode).toBe('SIMULATION');
    expect(simulated.held).toBe(194000);
    expect(simulated.available).toBe(0);
  });
  it('rejects duplicate collection recording for the same order', async () => {
    const a = await fixture();
    await service.recordCollection(adminId, a.order.id, a.input);
    await expect(
      service.recordCollection(adminId, a.order.id, {
        ...a.input,
        collectedAmount: 1,
      }),
    ).rejects.toThrow('already');
  });
  it('retains actual money without funding a mutated order or contradictory carrier state', async () => {
    for (const change of ['money', 'carrier'] as const) {
      const f = await fixture();
      await service.recordCollection(adminId, f.order.id, f.input);
      if (change === 'money')
        await f.db
          .getRepository(Order)
          .update(f.order.id, { commissionBasisPoints: 400 });
      else
        await f.db
          .getRepository(Shipment)
          .update(f.shipment.id, { reviewReason: 'CARRIER_DATA_MISMATCH' });
      await service.recordRemittance(adminId, receipt(f.order.id, 230000));
      expect((await service.detail(f.order.id)).collection.status).toBe(
        'REVIEW',
      );
      expect((await finance.view(f.owner.id, f.shop.id, {})).held).toBe(0);
    }
  });
  it('guards Shop isolation and does not expose bank or evidence data in Owner projection', async () => {
    const f = await fixture();
    await service.recordCollection(adminId, f.order.id, f.input);
    await service.recordRemittance(adminId, receipt(f.order.id, 230000));
    await expect(
      new AuthorizationService(f.db).authorize(
        randomUUID(),
        f.shop.id,
        'shop.owner',
      ),
    ).rejects.toThrow('Shop permission denied');
    const view = await finance.view(f.owner.id, f.shop.id, {});
    expect(JSON.stringify(view)).not.toContain(f.input.evidence);
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0].amount).toBe(194000);
  });
  it('allocates a single proven transfer across orders while preserving exact batch cash', async () => {
    const a = await fixture(),
      b = await fixture();
    await service.recordCollection(adminId, a.order.id, a.input);
    await service.recordCollection(adminId, b.order.id, b.input);
    const input = {
      ...receipt(a.order.id, 198000, 32000),
      netAmount: 396000,
      allocations: [
        { orderId: a.order.id, cashAmount: 198000, feeDeducted: 32000 },
        { orderId: b.order.id, cashAmount: 198000, feeDeducted: 32000 },
      ],
    };
    const batch = await service.recordRemittance(adminId, input);
    expect(batch.allocations).toHaveLength(2);
    await expect(
      service.recordRemittance(adminId, {
        ...input,
        allocations: [input.allocations[0], input.allocations[0]],
      }),
    ).rejects.toThrow('only once');
    expect(
      await a.db.getRepository(CodRemittance).countBy({ id: batch.id }),
    ).toBe(1);
  });
  it('rejects future/pre-collection receipts and wrong waybills without changing stored totals', async () => {
    const f = await fixture();
    await expect(
      service.recordCollection(adminId, f.order.id, {
        ...f.input,
        waybillCode: 'wrong',
      }),
    ).rejects.toThrow('waybill');
    await service.recordCollection(adminId, f.order.id, f.input);
    await expect(
      service.recordRemittance(adminId, {
        ...receipt(f.order.id, 230000),
        receivedAt: new Date(Date.now() + 60000).toISOString(),
      }),
    ).rejects.toThrow('time');
    await expect(
      service.recordRemittance(adminId, {
        ...receipt(f.order.id, 230000),
        receivedAt: new Date(Date.now() - 120000).toISOString(),
      }),
    ).rejects.toThrow('collection');
    expect(
      await f.db.getRepository(CodCollection).countBy({ orderId: f.order.id }),
    ).toBe(1);
  });
  it('blocks funding during unresolved cancellation and refreshes cleanly once closed', async () => {
    const f = await fixture();
    await f.db.getRepository(Order).update(f.order.id, {
      cancelState: 'APPROVED',
    });
    await service.recordCollection(adminId, f.order.id, f.input);
    await service.recordRemittance(adminId, receipt(f.order.id, 230000));
    expect((await finance.view(f.owner.id, f.shop.id, {})).held).toBe(0);
    await f.db
      .getRepository(Order)
      .update(f.order.id, { cancelState: 'CLOSED' });
    const row = await service.refresh(adminId, f.order.id);
    expect(row.status).toBe('FUNDED_HELD');
    expect((await finance.view(f.owner.id, f.shop.id, {})).held).toBe(194000);
  });
  it('blocks funding during unresolved late handover and refreshes exactly once after resolution', async () => {
    const f = await fixture();
    await f.db
      .getRepository(Order)
      .update(f.order.id, { handoverReviewRequired: true });
    await service.recordCollection(adminId, f.order.id, f.input);
    await service.recordRemittance(adminId, receipt(f.order.id, 230000));
    expect((await service.detail(f.order.id)).collection.status).toBe('REVIEW');
    expect((await finance.view(f.owner.id, f.shop.id, {})).held).toBe(0);
    await f.db
      .getRepository(Order)
      .update(f.order.id, { handoverReviewRequired: false });
    await Promise.all([
      service.refresh(adminId, f.order.id),
      service.refresh(adminId, f.order.id),
    ]);
    expect(
      await f.db
        .getRepository(ShopLedgerEntry)
        .countBy({ orderId: f.order.id }),
    ).toBe(1);
    expect((await finance.view(f.owner.id, f.shop.id, {})).available).toBe(0);
  });
  it('rolls back an entire multi-order transfer when any allocation violates its fee limit', async () => {
    const a = await fixture(),
      b = await fixture();
    await service.recordCollection(adminId, a.order.id, a.input);
    await service.recordCollection(adminId, b.order.id, b.input);
    const data = {
      ...receipt(a.order.id, 100000),
      netAmount: 200000,
      allocations: [
        { orderId: a.order.id, cashAmount: 100000, feeDeducted: 0 },
        { orderId: b.order.id, cashAmount: 100000, feeDeducted: 32001 },
      ],
    };
    await expect(service.recordRemittance(adminId, data)).rejects.toThrow(
      'fee',
    );
    expect(
      await a.db
        .getRepository(CodRemittance)
        .countBy({ mode: data.mode, reference: data.reference.toUpperCase() }),
    ).toBe(0);
    expect((await service.detail(a.order.id)).collection.cashReceived).toBe(0);
  });
  it('records a zero net bank settlement only when verified fee netting carries the full value', async () => {
    const f = await fixture();
    await service.recordCollection(adminId, f.order.id, {
      ...f.input,
      approvedCarrierFee: 230000,
    });
    await service.recordRemittance(adminId, receipt(f.order.id, 0, 230000));
    const row = (await service.detail(f.order.id)).collection;
    expect(row.cashReceived).toBe(0);
    expect(row.status).toBe('FUNDED_HELD');
    expect((await finance.view(f.owner.id, f.shop.id, {})).available).toBe(0);
  });
  it('does not mark an on-time verified pickup late merely because delivery arrives after the handover deadline', async () => {
    const f = await fixture();
    await f.db.getRepository(Order).update(f.order.id, {
      status: 'shipping',
      deliveryObservedAt: null,
      handoverBy: new Date(Date.now() - 3600000),
    });
    await f.db.getRepository(Shipment).update(f.shipment.id, {
      pickedObservedAt: new Date(Date.now() - 7200000),
      nextQueryAt: new Date(0),
      providerStatus: 'transporting',
    });
    const carrier = {
      query: async () => ({
        clientCode: f.shipment.id,
        orderCode: f.shipment.orderCode,
        shopId: 123,
        status: 'delivered',
        updatedAt: new Date().toISOString(),
        codAmount: 230000,
        paymentType: 1,
        codCollected: false,
        codTransferred: false,
        collectedAt: null,
        transferredAt: null,
      }),
    };
    const outbox = new OutboxService();
    const shipments = new ShipmentService(
      f.db,
      new OrderService(
        f.db,
        new WalletService(f.db),
        new CodPolicy(f.db),
        outbox,
        new CoinService(f.db),
      ),
      carrier as unknown as GhnShipmentClient,
      outbox,
    );
    await shipments.reconcile(f.shipment.id);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .handoverReviewRequired,
    ).toBe(false);
    await service.recordCollection(adminId, f.order.id, f.input);
    await service.recordRemittance(adminId, receipt(f.order.id, 230000));
    expect((await finance.view(f.owner.id, f.shop.id, {})).held).toBe(194000);
  });
});
