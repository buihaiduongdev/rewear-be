import { ConflictException } from '@nestjs/common';

import { EntityManager, In, LessThan } from 'typeorm';

import { FEE_PARTY, FEE_STATUS } from '../constants/fee.constant';
import { FeeAssessment } from '../entities';
import { feeOutstanding } from '../fee-accounting';

/** Fee restrictions are evaluated independently of anti-abuse or identity restrictions. */
export async function assertFeeCodEligibility(
  manager: EntityManager,
  buyerId: string,
  shopIds: string[],
  now: Date,
) {
  const buyerFees = await manager.findBy(FeeAssessment, {
    buyerId,
    party: FEE_PARTY.BUYER,
    status: FEE_STATUS.ACTIVE,
    dueAt: LessThan(now),
  });
  for (const fee of buyerFees)
    if ((await feeOutstanding(manager, fee.id)) > 0)
      throw new ConflictException(
        'Overdue verified buyer fees restrict new COD only; prepaid purchases remain available',
      );
  if (!shopIds.length) return;
  const shopFees = await manager.findBy(FeeAssessment, {
    shopId: In(shopIds),
    party: FEE_PARTY.SHOP,
    status: FEE_STATUS.ACTIVE,
    dueAt: LessThan(now),
  });
  for (const fee of shopFees)
    if ((await feeOutstanding(manager, fee.id)) > 0)
      throw new ConflictException({
        message:
          'This Shop has overdue verified shipping fees; prepaid purchases remain available',
        shopId: fee.shopId,
      });
}
