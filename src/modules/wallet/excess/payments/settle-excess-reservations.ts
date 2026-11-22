import { EntityManager } from 'typeorm';

import { EXCESS_REVIEW } from '../constants/excess.constant';
import { ExcessCapture, WalletExcess } from '../entities/excess.entity';
import { excessTotals } from '../policies/excess-accounting.policy';
import {
  collectExcessCapture,
  queueExcessRefund,
} from './excess-capture.policy';

/** Remove the reservation before calculating capacity: its own money is not another claim. */
export async function settleExcessReservations(
  manager: EntityManager,
  row: WalletExcess,
  now: Date,
) {
  if (row.reviewState === EXCESS_REVIEW.OPEN) return;
  const captures = await manager
    .createQueryBuilder(ExcessCapture, 'capture')
    .where('capture.reservations @> :target::jsonb', {
      target: JSON.stringify([{ excessId: row.id }]),
    })
    .orderBy('capture.createdAt', 'ASC')
    .addOrderBy('capture.id', 'ASC')
    .getMany();
  for (const capture of captures) {
    const reservation = capture.reservations.find(
      (r) => r.excessId === row.id,
    )!;
    capture.reservations = capture.reservations.filter(
      (r) => r.excessId !== row.id,
    );
    await manager.save(capture);
    const amount = Math.min(
      reservation.amount,
      (await excessTotals(manager, row)).outstanding,
    );
    await collectExcessCapture(manager, row, capture, amount);
    capture.allocated -= reservation.amount - amount;
    await manager.save(capture);
    await queueExcessRefund(manager, capture, reservation.amount - amount, now);
  }
}
