import { EntityManager } from 'typeorm';

import { CARRIER_RECEIPT_KIND } from '@/modules/dispute/returns/constants/return-exception.constant';
import {
  CarrierCompensationReceipt,
  ReturnShippingCharge,
} from '@/modules/dispute/returns/entities/return-exception.entity';

import { FEE_COLLECTION_METHOD, FEE_PARTY } from '../constants/fee.constant';
import { FeeAssessment, FeeCollection } from '../entities/fee.entity';
import { feeOutstanding, queueFeeCorrections } from '../fee-accounting';
import { FeeService } from '../fee.service';

export async function importVerifiedReturnFee(
  manager: EntityManager,
  charges: ReturnShippingCharge[],
  service: FeeService,
  now: Date,
) {
  for (const charge of charges) {
    const fee = await service.assessVerifiedReturnCharge(manager, charge, now);
    if (!fee) continue;
    const receipts = await manager.findBy(CarrierCompensationReceipt, {
      chargeId: charge.id,
      mode: charge.mode,
      kind: CARRIER_RECEIPT_KIND.VERIFIED_NETTING,
    });
    for (const receipt of receipts) {
      if (
        await manager.existsBy(FeeCollection, {
          feeId: fee.id,
          method: FEE_COLLECTION_METHOD.CARRIER_NETTING,
          sourceId: receipt.id,
        })
      )
        continue;
      // A verified historical carrier receipt records actual value already received.
      // If cash also arrived, retain the carrier receipt and reverse excess cash.
      await manager.save(
        FeeCollection,
        manager.create(FeeCollection, {
          feeId: fee.id,
          mode: charge.mode,
          method: FEE_COLLECTION_METHOD.CARRIER_NETTING,
          sourceId: receipt.id,
          amount: receipt.amount,
          createdAt: receipt.createdAt,
        }),
      );
      await queueFeeCorrections(manager, fee, fee.payableAmount, now);
    }
  }
}

export async function returnFeeOutstanding(
  manager: EntityManager,
  charge: ReturnShippingCharge,
  fallback: number,
) {
  const fee = await manager.findOneBy(FeeAssessment, {
    sourceId: charge.id,
    orderId: charge.orderId,
    shopId: charge.shopId,
    mode: charge.mode,
    party: FEE_PARTY.SHOP,
  });
  if (!fee) return fallback;
  return feeOutstanding(manager, fee.id);
}
