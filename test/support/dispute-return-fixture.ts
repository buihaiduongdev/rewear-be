import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import { CodReconciliationService } from '@/modules/cod-reconciliation/cod-reconciliation.service';
import { DisputeAdjudicationService } from '@/modules/dispute/dispute-adjudication.service';
import { DisputeRefundService } from '@/modules/dispute/dispute-refund.service';
import { DisputeReviewService } from '@/modules/dispute/dispute-review.service';
import { DisputeFinalDecision } from '@/modules/dispute/entities/dispute-appeal.entity';
import { DisputeDecision } from '@/modules/dispute/entities/dispute-decision.entity';
import { DisputeEvidence } from '@/modules/dispute/entities/dispute.entity';
import { DisputeReturn } from '@/modules/dispute/returns/entities/dispute-return.entity';
import { installReturnLabel } from '@/modules/dispute/returns/return.lifecycle';
import { Order } from '@/modules/order/entities/order.entity';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';

import { adjudicationFixture } from './adjudication-fixture';
import { createPrivateMedia } from './private-media';

export async function disputeReturnFixture(
  db: DataSource,
  mode: 'EVIDENCE' | 'SIMULATION' = 'EVIDENCE',
) {
  const f = await adjudicationFixture(db);
  const shipment = await db.getRepository(Shipment).save({
    orderId: f.order.id,
    state: 'BOOKED',
    orderCode: randomUUID(),
    payload: {
      from_name: 'Shop',
      from_phone: '0900000001',
      from_address: 'Shop street',
      from_province_name: 'Hồ Chí Minh',
      from_ward_name: 'Ward A',
      to_name: 'Buyer',
      to_phone: '0900000002',
      to_address: 'Buyer street',
      to_province_name: 'Hồ Chí Minh',
      to_ward_name: 'Ward B',
    },
    input: {} as Shipment['input'],
    quotedParcel: {} as Shipment['quotedParcel'],
    codAmount: f.order.total,
    providerStatus: 'delivered',
  });
  await db.getRepository(Order).update(f.order.id, { status: 'delivered' });
  await new CodReconciliationService(db).recordCollection(
    f.admin.id,
    f.order.id,
    {
      requestId: randomUUID(),
      mode,
      waybillCode: shipment.orderCode!,
      collectedAmount: f.order.total,
      approvedCarrierFee: 0,
      collectedAt: f.order.deliveryObservedAt!.toISOString(),
      reason: 'Verified collection',
      evidence: 'Signed carrier collection proof',
    },
  );
  await db.getRepository(Order).update(f.order.id, { status: 'dispute' });
  const adjudication = new DisputeAdjudicationService(db);
  const decision = await adjudication.decide(f.admin.id, f.issue.id, {
    requestId: randomUUID(),
    reviewToken: (await adjudication.review(f.issue.id)).reviewToken,
    outcome: 'REQUIRE_RETURN',
    responsibility: 'SELLER',
    reason: 'Wrong item',
    evidenceAssessment: 'Both parties evidence verified',
    refundPlan: { amount: f.order.subtotal, condition: 'RETURN_REQUIRED' },
  });
  await db
    .getRepository(DisputeDecision)
    .update(decision.id, { appealUntil: new Date(Date.now() - 1000) });
  await new DisputeReviewService(db).refreshIssue(f.issue.id);
  const final = await db
    .getRepository(DisputeFinalDecision)
    .findOneByOrFail({ decisionId: decision.id });
  const refunds = new DisputeRefundService(db);
  await refunds.refresh(final.id);
  const returned = await db
    .getRepository(DisputeReturn)
    .findOneByOrFail({ remedyKey: final.remedyKey });
  return { ...f, db, shipment, decision, final, returned, refunds };
}
export async function evidenceForReturn(
  f: Awaited<ReturnType<typeof disputeReturnFixture>>,
  actorId = f.buyer.id,
  tags: string[] = ['RETURN_ITEM', 'RETURN_PACKED_LABEL', 'RETURN_ACCESSORIES'],
) {
  const media = await createPrivateMedia(f.db, actorId);
  return f.db.getRepository(DisputeEvidence).save({
    orderId: f.order.id,
    uploadedById: actorId,
    mediaId: media.id,
    media,
    tags,
  });
}
export async function labelForReturn(
  f: Awaited<ReturnType<typeof disputeReturnFixture>>,
  mode: 'EVIDENCE' | 'SIMULATION' = 'EVIDENCE',
) {
  return f.db.transaction(async (manager) =>
    installReturnLabel(
      manager,
      await manager.findOneByOrFail(DisputeReturn, { id: f.returned.id }),
      {
        mode,
        waybillCode: randomUUID(),
        instructions: 'Prepaid return label; buyer does not advance shipping',
      },
      new Date(Date.now() - 60000),
    ),
  );
}
