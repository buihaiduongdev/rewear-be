import { randomUUID } from 'node:crypto';

import { DisputeIssue } from '@/modules/dispute/entities/dispute-issue.entity';
import { CarrierCompensationReceipt } from '@/modules/dispute/returns/entities/carrier-compensation-receipt.entity';
import { DisputeReturnException } from '@/modules/dispute/returns/entities/dispute-return-exception.entity';
import { DisputeReturn } from '@/modules/dispute/returns/entities/dispute-return.entity';
import { ReturnShippingCharge } from '@/modules/dispute/returns/entities/return-shipping-charge.entity';
import {
  FeePolicy,
  FeePolicyShopAcceptance,
} from '@/modules/fees/disclosure/entities';
import {
  FeeAssessment,
  FeeCollection,
  FeeRefund,
} from '@/modules/fees/entities';
import { FeeService } from '@/modules/fees/fee.service';
import { FeeWalletDebit } from '@/modules/fees/settlement/entities';
import { importVerifiedReturnFee } from '@/modules/fees/settlement/fee-return-bridge';
import { feeMoneyLock } from '@/modules/fees/settlement/fee-settlement.access';
import { FeeSettlementService } from '@/modules/fees/settlement/fee-settlement.service';
import { Order } from '@/modules/order/entities';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';
import { ShopSettlement } from '@/modules/shop-finance/entities/shop-settlement.entity';
import { readPayoutSources } from '@/modules/shop-finance/payout-sources';

import { createTestDatabase, type TestDatabase } from '../support/database';
import {
  disputeReturnFixture,
  labelForReturn,
} from '../support/dispute-return-fixture';

describe('Verified return fee and carrier netting bridge (PostgreSQL)', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => database?.destroy());
  async function fixture() {
    const db = database.dataSource,
      f = await disputeReturnFixture(db, 'EVIDENCE');
    const label = await labelForReturn(f, 'EVIDENCE');
    const publishedAt = new Date(f.order.createdAt.getTime() - 10000),
      acceptedAt = new Date(f.order.createdAt.getTime() - 1000);
    const version = (await db.getRepository(FeePolicy).count()) + 1;
    const policy = await db.getRepository(FeePolicy).save({
      version,
      publishedAt,
      publishedBy: f.admin.id,
      conditions: [
        {
          kind: 'RETURN_SHIPPING',
          text: 'Verified seller-fault actual return shipping costs, same Shop available funds only.',
        },
      ],
    });
    await db.getRepository(FeePolicyShopAcceptance).save({
      shopId: f.shop.id,
      policyId: policy.id,
      ownerId: f.owner.id,
      acceptedAt,
    });
    await db.getRepository(Order).update(f.order.id, {
      feeDisclosure: {
        policyId: policy.id,
        version,
        publishedAt: publishedAt.toISOString(),
        buyerAcceptedAt: null,
        sellers: {
          [f.shop.id]: {
            sellerAcceptedAt: acceptedAt.toISOString(),
            ownerId: f.owner.id,
          },
        },
      },
    });
    await db
      .getRepository(DisputeIssue)
      .update(f.issue.id, { status: 'RESOLVED_REFUND' });
    await db
      .getRepository(DisputeReturn)
      .update(f.returned.id, { state: 'READY' });
    const charge = await db.getRepository(ReturnShippingCharge).save({
      returnId: f.returned.id,
      orderId: f.order.id,
      shopId: f.shop.id,
      mode: 'EVIDENCE',
      waybillCode: label.labelCode,
      kind: 'STANDARD',
      amount: 5000,
      invoiceReference: randomUUID(),
      reason: 'Verified seller return charge',
      evidence: 'Verified actual return invoice and label',
      actorId: f.admin.id,
    });
    const service = new FeeService(db),
      settlement = new FeeSettlementService(db, service);
    return { ...f, db, charge, service, settlement };
  }
  it('imports a manual evidenced label once, keeps source and excludes missing prior disclosure', async () => {
    const f = await fixture();
    await f.settlement.run();
    await f.settlement.run();
    expect(
      await f.db
        .getRepository(FeeAssessment)
        .countBy({ sourceId: f.charge.id }),
    ).toBe(1);
    expect(
      await f.db
        .getRepository(FeeAssessment)
        .findOneByOrFail({ sourceId: f.charge.id }),
    ).toMatchObject({
      waybillId: f.charge.waybillCode,
      amount: 5000,
      mode: 'EVIDENCE',
    });
    const old = await fixture();
    await old.db
      .getRepository(Order)
      .update(old.order.id, { feeDisclosure: null });
    await old.settlement.run();
    expect(
      await old.db
        .getRepository(FeeAssessment)
        .countBy({ sourceId: old.charge.id }),
    ).toBe(0);
    await old.db
      .getRepository(ReturnShippingCharge)
      .update(old.charge.id, { waybillCode: null });
    expect(
      await old.service.assessVerifiedReturnCharge(
        old.db.manager,
        await old.db
          .getRepository(ReturnShippingCharge)
          .findOneByOrFail({ id: old.charge.id }),
        new Date(),
      ),
    ).toBeNull();
  });
  it('does not collect twice when confirmed carrier netting arrives after a cash offset', async () => {
    const f = await fixture();
    const credit = await f.db.getRepository(ShopLedgerEntry).save({
      orderId: f.order.id,
      shopId: f.shop.id,
      mode: 'EVIDENCE',
      type: 'COD_FUNDED_HELD',
      amount: 10000,
      collectionId: null,
      actorId: null,
    });
    await f.db.getRepository(ShopSettlement).save({
      orderId: f.order.id,
      shopId: f.shop.id,
      creditId: credit.id,
      mode: 'EVIDENCE',
      amount: 10000,
      refundDebit: 0,
    });
    await f.settlement.run();
    const fee = await f.db
      .getRepository(FeeAssessment)
      .findOneByOrFail({ sourceId: f.charge.id });
    expect(
      (await readPayoutSources(f.db.manager, f.shop.id, 'EVIDENCE')).available,
    ).toBe(5000);
    const exception = await f.db.getRepository(DisputeReturnException).save({
      finalDecisionId: f.final.id,
      orderId: f.order.id,
      shopId: f.shop.id,
      remedyKey: f.final.remedyKey,
      returnId: f.returned.id,
      direction: 'RETURN',
      kind: 'CARRIER_DAMAGE',
      mode: 'EVIDENCE',
      waybillCode: f.charge.waybillCode!,
      reason: 'Carrier verified damage during return transport',
      dispositionInstructions: 'Independent carrier compensation recorded',
      evidenceIds: [],
      verifiedBy: f.admin.id,
      occurredAt: new Date(),
    });
    await f.db.getRepository(CarrierCompensationReceipt).save({
      exceptionId: exception.id,
      chargeId: f.charge.id,
      shopId: f.shop.id,
      orderId: f.order.id,
      mode: 'EVIDENCE',
      reference: randomUUID(),
      kind: 'VERIFIED_NETTING',
      amount: 5000,
      receivedAt: new Date(),
      evidence: 'Confirmed carrier account offset against this exact charge',
      actorId: f.admin.id,
    });
    await f.db.transaction(async (manager) => {
      const now = await feeMoneyLock(manager);
      await importVerifiedReturnFee(manager, [f.charge], f.service, now);
    });
    const refund = await f.db
      .getRepository(FeeRefund)
      .findOneByOrFail({ feeId: fee.id });
    expect(refund).toMatchObject({
      method: 'SHOP_OFFSET',
      amount: 5000,
      state: 'PENDING',
    });
    await f.settlement.run();
    await f.settlement.run();
    expect(
      (await readPayoutSources(f.db.manager, f.shop.id, 'EVIDENCE')).available,
    ).toBe(10000);
    expect(
      await f.db.getRepository(FeeCollection).countBy({ feeId: fee.id }),
    ).toBe(2);
    expect(await f.db.getRepository(FeeRefund).countBy({ feeId: fee.id })).toBe(
      1,
    );
    expect(await f.db.getRepository(FeeWalletDebit).count()).toBe(0);
  });
});
