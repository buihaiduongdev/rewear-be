import { randomUUID } from 'node:crypto';

import { CodReconciliationService } from '@/modules/cod-reconciliation/cod-reconciliation.service';
import { DisputeFinalDecision } from '@/modules/dispute/entities/dispute-appeal.entity';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund.entity';
import { DisputeReturn } from '@/modules/dispute/returns/entities/dispute-return.entity';
import {
  CarrierCompensationReceipt,
  DisputeReturnException,
} from '@/modules/dispute/returns/entities/return-exception.entity';
import { ReturnCarrierService } from '@/modules/dispute/returns/return-carrier.service';
import { ReturnExceptionReadService } from '@/modules/dispute/returns/return-exception-read.service';
import { ReturnSafetyService } from '@/modules/dispute/returns/return-safety.service';
import { DisputeReturnService } from '@/modules/dispute/returns/return.service';
import { ShopFinanceService } from '@/modules/shop-finance/shop-finance.service';
import { WalletAccount } from '@/modules/wallet/entities';

import { createTestDatabase, type TestDatabase } from '../support/database';
import {
  disputeReturnFixture,
  evidenceForReturn,
  labelForReturn,
} from '../support/dispute-return-fixture';

describe('Safety waiver and independent carrier compensation (PostgreSQL)', () => {
  let database: TestDatabase,
    safety: ReturnSafetyService,
    carrier: ReturnCarrierService,
    reads: ReturnExceptionReadService;
  beforeAll(async () => {
    database = await createTestDatabase();
    safety = new ReturnSafetyService(database.dataSource);
    carrier = new ReturnCarrierService(database.dataSource);
    reads = new ReturnExceptionReadService(database.dataSource);
  });
  afterAll(async () => database?.destroy());
  const request = () => ({ requestId: randomUUID() });
  it('does not treat an unsafe finding alone or buyer claim as proof of executed disposal instructions', async () => {
    const f = await disputeReturnFixture(database.dataSource);
    await safety.authorize(f.admin.id, f.final.id, {
      ...request(),
      mode: 'EVIDENCE',
      basis: 'UNSAFE',
      reason: 'Verified unsafe contamination',
      instructions: 'Follow the documented safe disposal procedure',
      evidenceIds: [f.evidence.id],
    });
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'PENDING',
    });
    const proof = await evidenceForReturn(f, f.buyer.id, ['SAFETY_EXECUTION']);
    await expect(
      safety.submit(f.owner.id, f.final.id, {
        ...request(),
        statement: 'Done',
        evidenceIds: [proof.id],
      }),
    ).rejects.toThrow('Only the buyer');
    await safety.submit(f.buyer.id, f.final.id, {
      ...request(),
      statement: 'Executed the instructions; evidence attached',
      evidenceIds: [proof.id],
    });
    await expect(
      safety.confirm(f.admin.id, f.final.id, {
        ...request(),
        reviewToken: '0'.repeat(64),
        reason: 'Reviewed',
      }),
    ).rejects.toThrow('changed');
    const review = await reads.read(f.admin.id, f.final.id, true);
    const command = {
      ...request(),
      reviewToken: review.reviewToken,
      reason: 'Verified execution against original safety instructions',
    };
    await safety.confirm(f.admin.id, f.final.id, command);
    await safety.confirm(f.admin.id, f.final.id, command);
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'SUCCEEDED',
    });
    expect(
      (
        await f.db
          .getRepository(WalletAccount)
          .findOneByOrFail({ userId: f.buyer.id })
      ).balance,
    ).toBe(100001);
  });
  async function carrierLoss() {
    const f = await disputeReturnFixture(database.dataSource),
      label = await labelForReturn(f),
      proof = await evidenceForReturn(f);
    await new DisputeReturnService(f.db).act(f.admin.id, label.id, 'HANDOVER', {
      ...request(),
      reason: 'Exact carrier pickup verified',
      mode: 'EVIDENCE',
      labelCode: label.labelCode!,
      observedAt: new Date(),
      evidenceIds: [proof.id],
    });
    const review = await reads.read(f.admin.id, f.final.id, true);
    const exception = await carrier.verify(f.admin.id, f.final.id, {
      ...request(),
      reviewToken: review.reviewToken,
      direction: 'RETURN',
      kind: 'CARRIER_LOSS',
      mode: 'EVIDENCE',
      waybillCode: label.labelCode,
      occurredAt: new Date().toISOString(),
      reason: 'Carrier investigation confirms parcel loss, not mere delay',
      dispositionInstructions:
        'No parcel recovery possible; independent carrier claim opened',
      evidenceIds: [proof.id],
    });
    return { ...f, label, proof, exception };
  }
  it('verified carrier loss refunds buyer without waiting for compensation and does not advance Shop compensation', async () => {
    const f = await carrierLoss();
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'SUCCEEDED',
    });
    const finance = new ShopFinanceService(f.db);
    expect(await finance.view(f.owner.id, f.shop.id, {})).toMatchObject({
      available: 0,
      carrierCompensation: 0,
    });
    const acknowledgement = {
      ...request(),
      amount: 70000,
      conditions: 'Actual confirmed limited carrier liability',
      evidence: 'Carrier award reference',
    };
    await carrier.acknowledge(f.admin.id, f.exception.id, acknowledgement);
    expect(await finance.view(f.owner.id, f.shop.id, {})).toMatchObject({
      available: 0,
    });
    const receipt = {
      ...request(),
      mode: 'EVIDENCE',
      reference: randomUUID(),
      kind: 'CASH',
      amount: 30000,
      receivedAt: new Date().toISOString(),
      evidence: 'Confirmed bank receipt allocated to this claim',
    };
    await carrier.receive(f.admin.id, f.exception.id, receipt);
    await carrier.receive(f.admin.id, f.exception.id, receipt);
    expect(await finance.view(f.owner.id, f.shop.id, {})).toMatchObject({
      available: 30000,
      carrierCompensation: 30000,
    });
    await expect(
      carrier.receive(f.admin.id, f.exception.id, {
        ...receipt,
        ...request(),
        reference: randomUUID(),
        amount: 50000,
      }),
    ).rejects.toThrow('exceeds');
    expect(
      await f.db
        .getRepository(CarrierCompensationReceipt)
        .countBy({ exceptionId: f.exception.id }),
    ).toBe(1);
    await expect(
      new CodReconciliationService(f.db).recordRemittance(f.admin.id, {
        ...request(),
        mode: 'EVIDENCE',
        reference: receipt.reference,
        netAmount: 30000,
        receivedAt: new Date().toISOString(),
        reason: 'Same reference cannot fund a second ledger',
        evidence: 'Receipt reused',
        allocations: [
          { orderId: f.order.id, cashAmount: 30000, feeDeducted: 0 },
        ],
      }),
    ).rejects.toThrow('already allocated');
  });
  it('rejects carrier loss verification before actual handover and cannot claim a foreign or wrong-mode waybill', async () => {
    const f = await disputeReturnFixture(database.dataSource),
      label = await labelForReturn(f);
    const review = await reads.read(f.admin.id, f.final.id, true);
    await expect(
      carrier.verify(f.admin.id, f.final.id, {
        ...request(),
        reviewToken: review.reviewToken,
        direction: 'RETURN',
        kind: 'CARRIER_LOSS',
        mode: 'EVIDENCE',
        waybillCode: label.labelCode,
        occurredAt: new Date().toISOString(),
        reason: 'Unverified loss',
        dispositionInstructions: 'Claim',
        evidenceIds: [f.evidence.id],
      }),
    ).rejects.toThrow('handover');
    expect(
      await f.db
        .getRepository(DisputeReturnException)
        .countBy({ finalDecisionId: f.final.id }),
    ).toBe(0);
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(0);
  });
  it('seller refusal can satisfy a valid timely return duty and records only verified related extra shipping liability', async () => {
    const f = await disputeReturnFixture(database.dataSource),
      label = await labelForReturn(f),
      proof = await evidenceForReturn(f);
    await new DisputeReturnService(f.db).act(f.admin.id, label.id, 'HANDOVER', {
      ...request(),
      reason: 'Carrier pickup verified',
      mode: 'EVIDENCE',
      labelCode: label.labelCode!,
      observedAt: new Date(),
      evidenceIds: [proof.id],
    });
    const token = (await reads.read(f.admin.id, f.final.id, true)).reviewToken;
    await carrier.verify(f.admin.id, f.final.id, {
      ...request(),
      reviewToken: token,
      direction: 'RETURN',
      kind: 'SELLER_REFUSAL',
      mode: 'EVIDENCE',
      waybillCode: label.labelCode,
      occurredAt: new Date().toISOString(),
      reason:
        'Verified correct address, authorized receiver and conforming parcel; refusal unjustified',
      dispositionInstructions: 'Platform redirects parcel to verified storage',
      evidenceIds: [proof.id],
    });
    await carrier.charge(f.admin.id, f.final.id, {
      ...request(),
      mode: 'EVIDENCE',
      kind: 'REFUSAL_EXTRA',
      amount: 20000,
      invoiceReference: randomUUID(),
      reason: 'Verified extra redirection cost caused by refusal',
      evidence: 'Carrier invoice',
    });
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'SUCCEEDED',
    });
    expect(
      await new ShopFinanceService(f.db).view(f.owner.id, f.shop.id, {}),
    ).toMatchObject({ returnFeePayable: 20000, available: 0 });
  });

  it('does not authorize safety as a way to revive an already expired unexecuted return', async () => {
    const f = await disputeReturnFixture(database.dataSource);
    await labelForReturn(f);
    await f.db
      .getRepository(DisputeReturn)
      .update(f.returned.id, { handoverBy: new Date(Date.now() - 1000) });
    await expect(
      safety.authorize(f.admin.id, f.final.id, {
        ...request(),
        mode: 'EVIDENCE',
        basis: 'UNSAFE',
        reason: 'Late safety claim needs explicit incident review',
        instructions: 'Safe instructions',
        evidenceIds: [f.evidence.id],
      }),
    ).rejects.toThrow('expired');
  });
  it('safety fulfillment cannot override a verified per-item buyer-fault refund limit', async () => {
    const f = await disputeReturnFixture(database.dataSource);
    const label = await labelForReturn(f);
    await f.db.getRepository(DisputeReturn).update(label.id, {
      state: 'READY',
      handoverAt: new Date(),
      readyAt: new Date(),
      refundLimit: 50000,
      readyReason: 'BUYER_FAULT',
    });
    await safety.authorize(f.admin.id, f.final.id, {
      ...request(),
      mode: 'EVIDENCE',
      basis: 'UNSAFE',
      reason: 'Subsequent verified safety risk',
      instructions: 'Verified disposal instructions',
      evidenceIds: [f.evidence.id],
    });
    const proof = await evidenceForReturn(f, f.buyer.id, ['SAFETY_EXECUTION']);
    await safety.submit(f.buyer.id, f.final.id, {
      ...request(),
      statement: 'Executed disposal',
      evidenceIds: [proof.id],
    });
    await safety.confirm(f.admin.id, f.final.id, {
      ...request(),
      reviewToken: (await reads.read(f.admin.id, f.final.id, true)).reviewToken,
      reason: 'Execution verified',
    });
    await f.refunds.refresh(f.final.id);
    expect(
      (
        await f.db
          .getRepository(WalletAccount)
          .findOneByOrFail({ userId: f.buyer.id })
      ).balance,
    ).toBe(50000);
  });
  it('carrier liability evidence does not bypass the independent exact partial-agreement consents', async () => {
    const f = await disputeReturnFixture(database.dataSource);
    await f.db.getRepository(DisputeFinalDecision).update(f.final.id, {
      responsibility: 'CARRIER',
      outcome: 'UPHOLD_CLAIM',
      refundPlan: { amount: 40000, condition: 'PARTIAL_AGREEMENT' },
    });
    const review = await reads.read(f.admin.id, f.final.id, true);
    await carrier.verify(f.admin.id, f.final.id, {
      ...request(),
      reviewToken: review.reviewToken,
      direction: 'OUTBOUND',
      kind: 'CARRIER_DAMAGE',
      mode: 'EVIDENCE',
      waybillCode: f.shipment.orderCode,
      occurredAt: new Date().toISOString(),
      reason: 'Confirmed outbound damage',
      dispositionInstructions: 'Partial settlement still needs party consent',
      evidenceIds: [f.evidence.id],
    });
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'PENDING',
      blockedReason: 'CONSENT_PENDING',
    });
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(0);
  });
  it('allocates compensation receipt to the exact claim leg, not another claim sharing the final decision', async () => {
    const f = await disputeReturnFixture(database.dataSource);
    await f.db
      .getRepository(DisputeFinalDecision)
      .update(f.final.id, { responsibility: 'CARRIER' });
    const outbound = await carrier.verify(f.admin.id, f.final.id, {
      ...request(),
      reviewToken: (await reads.read(f.admin.id, f.final.id, true)).reviewToken,
      direction: 'OUTBOUND',
      kind: 'CARRIER_DAMAGE',
      mode: 'EVIDENCE',
      waybillCode: f.shipment.orderCode,
      occurredAt: new Date().toISOString(),
      reason: 'Original leg damage confirmed',
      dispositionInstructions: 'Separate original-leg claim',
      evidenceIds: [f.evidence.id],
    });
    const label = await labelForReturn(f),
      proof = await evidenceForReturn(f);
    await new DisputeReturnService(f.db).act(f.admin.id, label.id, 'HANDOVER', {
      ...request(),
      reason: 'Return pickup verified',
      mode: 'EVIDENCE',
      labelCode: label.labelCode!,
      observedAt: new Date(),
      evidenceIds: [proof.id],
    });
    const returned = await carrier.verify(f.admin.id, f.final.id, {
      ...request(),
      reviewToken: (await reads.read(f.admin.id, f.final.id, true)).reviewToken,
      direction: 'RETURN',
      kind: 'CARRIER_LOSS',
      mode: 'EVIDENCE',
      waybillCode: label.labelCode,
      occurredAt: new Date().toISOString(),
      reason: 'Return leg loss confirmed',
      dispositionInstructions: 'Separate return-leg claim',
      evidenceIds: [proof.id],
    });
    await carrier.acknowledge(f.admin.id, outbound.id, {
      ...request(),
      amount: 10000,
      conditions: 'Original leg limited award',
      evidence: 'Original claim acknowledgement',
    });
    await carrier.acknowledge(f.admin.id, returned.id, {
      ...request(),
      amount: 20000,
      conditions: 'Return leg limited award',
      evidence: 'Return claim acknowledgement',
    });
    const receipt = await carrier.receive(f.admin.id, returned.id, {
      ...request(),
      mode: 'EVIDENCE',
      reference: randomUUID(),
      kind: 'CASH',
      amount: 15000,
      receivedAt: new Date().toISOString(),
      evidence: 'Return claim bank transfer',
    });
    expect(receipt.exceptionId).toBe(returned.id);
  });

  it('verified netting settles only a linked charge and cannot create spendable cash compensation', async () => {
    const f = await carrierLoss();
    const charge = await carrier.charge(f.admin.id, f.final.id, {
      ...request(),
      mode: 'EVIDENCE',
      kind: 'STANDARD',
      amount: 10000,
      invoiceReference: randomUUID(),
      reason: 'Verified standard prepaid return fee',
      evidence: 'Carrier invoice',
    });
    await carrier.acknowledge(f.admin.id, f.exception.id, {
      ...request(),
      amount: 30000,
      conditions: 'Carrier confirmed limited liability',
      evidence: 'Carrier acknowledgement',
    });
    await carrier.receive(f.admin.id, f.exception.id, {
      ...request(),
      mode: 'EVIDENCE',
      reference: randomUUID(),
      kind: 'VERIFIED_NETTING',
      chargeId: charge.id,
      amount: 10000,
      receivedAt: new Date().toISOString(),
      evidence: 'Verified compensation offset against this exact fee',
    });
    expect(
      await new ShopFinanceService(f.db).view(f.owner.id, f.shop.id, {}),
    ).toMatchObject({
      available: 0,
      carrierCompensation: 10000,
      returnFeePayable: 0,
    });
    await expect(
      carrier.receive(f.admin.id, f.exception.id, {
        ...request(),
        mode: 'EVIDENCE',
        reference: randomUUID(),
        kind: 'VERIFIED_NETTING',
        chargeId: charge.id,
        amount: 1,
        receivedAt: new Date().toISOString(),
        evidence: 'Repeated fee offset',
      }),
    ).rejects.toThrow('outstanding');
  });
});
