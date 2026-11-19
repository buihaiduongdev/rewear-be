import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { OrderAccess } from '@/modules/order/order.access';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { DISPUTE_ACTION } from './constants/dispute.constant';
import { decisionFingerprint } from './dispute-decision-review';
import { DisputeRefundService } from './dispute-refund.service';
import { DisputeAccess } from './dispute.access';
import { notifyDispute, recordDisputeAction } from './dispute.lifecycle';
import { DisputeFinalDecision } from './entities/dispute-appeal.entity';
import { DisputeDecision } from './entities/dispute-decision.entity';
import {
  DisputeRefund,
  DisputeRefundCredit,
  DisputeRefundIncidentUpdate,
} from './entities/dispute-refund.entity';
import { DisputeCase, DisputeIssue } from './entities/dispute.entity';
import { refundAllocation } from './policies/refund-allocation.policy';
import { DisputeReturn } from './returns/entities/dispute-return.entity';
import { refundIncidentSchema } from './schemas/refund-execution.schema';

@Injectable()
export class DisputeRefundReadService {
  constructor(
    private readonly db: DataSource,
    private readonly refunds: DisputeRefundService,
  ) {}
  view(userId: string, finalId: string, admin = false) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const final = await manager.findOneByOrFail(DisputeFinalDecision, {
        id: finalId,
      });
      const issue = await manager.findOneByOrFail(DisputeIssue, {
        id: final.issueId,
      });
      const row = await manager.findOneByOrFail(DisputeCase, {
        id: issue.caseId,
      });
      if (admin)
        await manager.findOneByOrFail(User, {
          id: userId,
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
        });
      else
        await new DisputeAccess(new OrderAccess()).assertParty(
          manager,
          userId,
          row.orderId,
        );
      const initial = await manager.findOneByOrFail(DisputeDecision, {
        id: final.decisionId,
      });
      const approved = final.refundPlan
        ? refundAllocation(
            final.itemPrice,
            final.refundPlan.amount,
            0,
            initial.basis.commissionBasisPoints,
          )
        : null;
      const refund = await manager.findOneBy(DisputeRefund, {
        finalDecisionId: finalId,
      });
      const credits = refund
        ? await manager.find(DisputeRefundCredit, {
            where: { refundId: refund.id },
            order: { createdAt: 'ASC' },
          })
        : [];
      const updates = refund
        ? await manager.find(DisputeRefundIncidentUpdate, {
            where: { refundId: refund.id },
            order: { createdAt: 'DESC' },
            take: 50,
          })
        : [];
      const returnCase = await manager.findOneBy(DisputeReturn, {
        remedyKey: final.remedyKey,
      });
      return {
        returnCase,
        finalDecisionId: finalId,
        refundPlan: final.refundPlan ?? null,
        planToken: this.refunds.planToken(final),
        approvedSellerDebit: approved?.sellerDebit ?? null,
        refund,
        credits,
        updates,
      };
    });
  }
  async incident(adminId: string, refundId: string, input: unknown) {
    const data = refundIncidentSchema.parse(input);
    const fingerprint = decisionFingerprint({ adminId, refundId, ...data });
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      await manager.findOneByOrFail(User, {
        id: adminId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      });
      const replay = await manager.findOneBy(DisputeRefundIncidentUpdate, {
        requestId: data.requestId,
      });
      if (replay) {
        if (replay.requestFingerprint !== fingerprint)
          throw new ConflictException(
            'Incident request already used with different input',
          );
        return replay;
      }
      const refund = await manager.findOneByOrFail(DisputeRefund, {
        id: refundId,
      });
      if (!refund.alertedAt)
        throw new ConflictException('Refund has no operational incident');
      if (new Date(data.nextUpdateAt) <= now)
        throw new ConflictException(
          'Next incident update must be in the future',
        );
      const update = await manager.save(
        DisputeRefundIncidentUpdate,
        manager.create(DisputeRefundIncidentUpdate, {
          ...data,
          nextUpdateAt: new Date(data.nextUpdateAt),
          refundId,
          actorId: adminId,
          requestFingerprint: fingerprint,
          createdAt: now,
        }),
      );
      refund.respondedAt ??= now;
      await manager.save(refund);
      const final = await manager.findOneByOrFail(DisputeFinalDecision, {
        id: refund.finalDecisionId,
      });
      await recordDisputeAction(
        manager,
        final.issueId,
        DISPUTE_ACTION.REFUND_INCIDENT_UPDATED,
        adminId,
        now,
        data.statusNote,
      );
      await notifyDispute(
        manager,
        final.issueId,
        DISPUTE_ACTION.REFUND_INCIDENT_UPDATED,
        now,
        `${data.statusNote}\n${data.stepsTaken}\nNext update: ${data.nextUpdateAt}`,
        data.requestId,
      );
      return update;
    });
  }
}
