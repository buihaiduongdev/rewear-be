import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import { GhnShipmentClient } from '@/infrastructure/shipping/clients/ghn-shipment.client';
import { CodReconciliationService } from '@/modules/cod-reconciliation/cod-reconciliation.service';
import { CoinService } from '@/modules/coins/coin.service';
import { DisputeAdjudicationService } from '@/modules/dispute/dispute-adjudication.service';
import { DisputeRefundService } from '@/modules/dispute/dispute-refund.service';
import { DisputeAccess } from '@/modules/dispute/dispute.access';
import { DisputeDecision } from '@/modules/dispute/entities/dispute-decision.entity';
import { DisputeReturn } from '@/modules/dispute/returns/entities/dispute-return.entity';
import { DisputeReturnService } from '@/modules/dispute/returns/return.service';
import { OutboxService } from '@/modules/event/outbox.service';
import { Order } from '@/modules/order/entities';
import { OrderAccess } from '@/modules/order/order.access';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';

import { adjudicationFixture } from './adjudication-fixture';

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
  await new CodReconciliationService(db, new CoinService(db)).recordCollection(
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

  const orderAccess = new OrderAccess();
  const access = new DisputeAccess(orderAccess);
  const outbox = new OutboxService();
  const refunds = new DisputeRefundService(db, access, outbox);
  const returns = new DisputeReturnService(
    db,
    {} as GhnShipmentClient,
    access,
    orderAccess,
    refunds,
  );
  const adjudication = new DisputeAdjudicationService(
    db,
    access,
    refunds,
    returns,
    outbox,
  );

  const decision = await adjudication.decide(f.admin.id, f.issue.id, {
    outcome: 'REQUIRE_RETURN',
    responsibility: 'SELLER',
    reason: 'Wrong item received',
  });
  await db
    .getRepository(DisputeDecision)
    .update(decision.id, { appealUntil: new Date(Date.now() - 1000) });
  await adjudication.refreshIssue(f.issue.id);

  const finalized = await db
    .getRepository(DisputeDecision)
    .findOneByOrFail({ id: decision.id });
  const returned = await db
    .getRepository(DisputeReturn)
    .findOneByOrFail({ decisionId: decision.id });

  return {
    ...f,
    db,
    shipment,
    decision: finalized,
    returned,
    refunds,
    returns,
    adjudication,
  };
}
