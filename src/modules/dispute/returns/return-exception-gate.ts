import { EntityManager } from 'typeorm';

import { DISPUTE_REFUND_CONDITION } from '../constants/refund.constant';
import { DisputeFinalDecision } from '../entities/dispute-appeal.entity';
import { CARRIER_DIRECTION } from './constants/return-exception.constant';
import { RETURN_STATE } from './constants/return.constant';
import { DisputeReturn } from './entities/dispute-return.entity';
import {
  DisputeReturnException,
  DisputeSafetyWaiver,
} from './entities/return-exception.entity';
import type { ReturnGate } from './types/return.type';

export async function returnExceptionGate(
  manager: EntityManager,
  final: DisputeFinalDecision,
): Promise<ReturnGate | null> {
  const safety = await manager.findOneBy(DisputeSafetyWaiver, {
    finalDecisionId: final.id,
  });
  if (safety) {
    const returned = await manager.findOneBy(DisputeReturn, {
      remedyKey: final.remedyKey,
    });
    const amount = Math.min(
      final.refundPlan!.amount,
      returned?.refundLimit ?? final.refundPlan!.amount,
    );
    return {
      status: safety.fulfilledAt ? 'READY' : 'PENDING',
      amount,
      at: safety.fulfilledAt,
      mode: safety.mode,
    };
  }
  if (final.refundPlan?.condition === DISPUTE_REFUND_CONDITION.SAFETY_WAIVER)
    return null;
  const exception = await manager.findOneBy(DisputeReturnException, {
    remedyKey: final.remedyKey,
    direction:
      final.refundPlan?.condition === 'RETURN_REQUIRED'
        ? CARRIER_DIRECTION.RETURN
        : CARRIER_DIRECTION.OUTBOUND,
  });
  if (!exception) return null;
  if (exception.direction === CARRIER_DIRECTION.RETURN) {
    const returned = await manager.findOneByOrFail(DisputeReturn, {
      id: exception.returnId!,
    });
    const valid =
      returned.remedyKey === final.remedyKey &&
      returned.handoverAt &&
      returned.handoverBy &&
      returned.handoverAt <= returned.handoverBy &&
      returned.state !== RETURN_STATE.EXPIRED &&
      returned.mode === exception.mode;
    if (!valid) return null;
    const amount = Math.min(
      final.refundPlan!.amount,
      returned.refundLimit ?? final.refundPlan!.amount,
    );
    return {
      status: 'READY',
      amount,
      at: exception.createdAt,
      mode: exception.mode,
    };
  }
  return {
    status: 'READY',
    amount: final.refundPlan!.amount,
    at: exception.createdAt,
    mode: exception.mode,
  };
}
