import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { DataSource, In } from 'typeorm';

import { REFUND_STATE } from '../constants/refund-execution.constant';
import { DISPUTE_REFUND_CONDITION } from '../constants/refund.constant';
import { DisputeRefund } from '../entities/dispute-refund.entity';
import { DisputeEvidence } from '../entities/dispute.entity';
import { RETURN_STATE } from './constants/return.constant';
import { DisputeReturn } from './entities/dispute-return.entity';
import { DisputeSafetyWaiver } from './entities/return-exception.entity';
import {
  linkRemedyEvidence,
  remedyReviewToken,
  runRemedyCommand,
} from './return-remedy.access';
import { reconcileReturnClock } from './return.lifecycle';
import {
  safetyConfirmSchema,
  safetyExecutionSchema,
  safetyWaiverSchema,
} from './schemas/return-exception.schema';

@Injectable()
export class ReturnSafetyService {
  constructor(private readonly db: DataSource) {}
  authorize(adminId: string, finalId: string, input: unknown) {
    const data = safetyWaiverSchema.parse(input);
    return runRemedyCommand(
      this.db,
      adminId,
      finalId,
      'SAFETY_AUTHORIZED',
      data,
      true,
      DisputeSafetyWaiver,
      async (manager, ctx, now) => {
        const allowed =
          ctx.final.refundPlan?.condition ===
            DISPUTE_REFUND_CONDITION.SAFETY_WAIVER ||
          ctx.final.refundPlan?.condition ===
            DISPUTE_REFUND_CONDITION.RETURN_REQUIRED;
        if (!allowed)
          throw new ConflictException(
            'This final remedy does not permit a safety waiver',
          );
        const refund = await manager.findOneBy(DisputeRefund, {
          finalDecisionId: finalId,
        });
        if (refund && refund.status !== REFUND_STATE.PENDING)
          throw new ConflictException(
            'Closed or executed remedy requires a separate incident review',
          );
        const returned = await manager.findOneBy(DisputeReturn, {
          remedyKey: ctx.final.remedyKey,
        });
        if (returned) {
          await reconcileReturnClock(manager, returned, now);
          if (returned.state === RETURN_STATE.EXPIRED)
            throw new ConflictException(
              'Return already expired; verified recovery must be reviewed separately',
            );
        }
        if (
          await manager.existsBy(DisputeSafetyWaiver, {
            finalDecisionId: finalId,
          })
        )
          throw new ConflictException('Safety waiver already recorded');
        const row = await manager.save(
          DisputeSafetyWaiver,
          manager.create(DisputeSafetyWaiver, {
            finalDecisionId: finalId,
            orderId: ctx.order.id,
            mode: data.mode,
            basis: data.basis,
            reason: data.reason,
            instructions: data.instructions,
            verifiedBy: adminId,
            basisEvidenceIds: data.evidenceIds,
            executionEvidenceIds: null,
            executionStatement: null,
            submittedAt: null,
            fulfilledAt: null,
            fulfilledBy: null,
            createdAt: now,
          }),
        );
        await linkRemedyEvidence(
          manager,
          ctx.order.id,
          row.id,
          data.evidenceIds,
        );
        return row;
      },
    );
  }
  submit(buyerId: string, finalId: string, input: unknown) {
    const data = safetyExecutionSchema.parse(input);
    return runRemedyCommand(
      this.db,
      buyerId,
      finalId,
      'SAFETY_SUBMITTED',
      data,
      false,
      DisputeSafetyWaiver,
      async (manager, ctx, now) => {
        if (ctx.order.buyerId !== buyerId)
          throw new ForbiddenException(
            'Only the buyer may submit safety execution proof',
          );
        const row = await manager.findOneByOrFail(DisputeSafetyWaiver, {
          finalDecisionId: finalId,
        });
        if (row.submittedAt)
          throw new ConflictException(
            'Execution proof already submitted; review existing record',
          );
        const proof = await manager.find(DisputeEvidence, {
          where: { id: In(data.evidenceIds) },
        });
        if (proof.some((file) => file.recordedAt < row.createdAt))
          throw new ConflictException(
            'Execution evidence must follow the recorded safety instructions',
          );
        await linkRemedyEvidence(
          manager,
          ctx.order.id,
          row.id,
          data.evidenceIds,
          buyerId,
        );
        row.executionEvidenceIds = data.evidenceIds;
        row.executionStatement = data.statement;
        row.submittedAt = now;
        return manager.save(row);
      },
    );
  }
  confirm(adminId: string, finalId: string, input: unknown) {
    const data = safetyConfirmSchema.parse(input);
    return runRemedyCommand(
      this.db,
      adminId,
      finalId,
      'SAFETY_CONFIRMED',
      data,
      true,
      DisputeSafetyWaiver,
      async (manager, ctx, now) => {
        const row = await manager.findOneByOrFail(DisputeSafetyWaiver, {
          finalDecisionId: finalId,
        });
        if (row.fulfilledAt)
          throw new ConflictException('Safety execution already verified');
        if (!row.submittedAt || !row.executionEvidenceIds?.length)
          throw new ConflictException('Buyer execution evidence is required');
        if (data.reviewToken !== (await remedyReviewToken(manager, ctx)))
          throw new ConflictException(
            'Safety review changed; reload instructions and execution proof',
          );
        await linkRemedyEvidence(
          manager,
          ctx.order.id,
          row.id,
          row.executionEvidenceIds,
          ctx.order.buyerId,
        );
        row.fulfilledAt = now;
        row.fulfilledBy = adminId;
        return manager.save(row);
      },
    );
  }
}
