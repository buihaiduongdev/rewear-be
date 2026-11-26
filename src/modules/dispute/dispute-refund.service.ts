import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { adjustPurchaseReward } from '@/modules/coins/rewards/adjust-purchase-reward';
import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { OutboxService } from '@/modules/event/outbox.service';
import { Order } from '@/modules/order/entities';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';
import { WalletAccount } from '@/modules/wallet/entities';
import { walletBalanceSchema } from '@/modules/wallet/schemas/wallet.schema';

import {
  DISPUTE_DECISION_OUTCOME,
  DISPUTE_ISSUE_STATE,
  DISPUTE_POLICY,
} from './constants/dispute.constant';
import { refundAllocation } from './dispute-refund-accounting';
import { refundFunding } from './dispute-refund-funding';
import { DisputeAccess, restoreDisputeCaseIfClear } from './dispute.access';
import { DisputeCase } from './entities/dispute-case.entity';
import { DisputeDecision } from './entities/dispute-decision.entity';
import { DisputeIssue } from './entities/dispute-issue.entity';
import { DisputeRefundCredit } from './entities/dispute-refund-credit.entity';
import { RETURN_STATE } from './returns/constants/return.constant';
import { DisputeReturn } from './returns/entities/dispute-return.entity';

@Injectable()
export class DisputeRefundService {
  private readonly logger = new Logger(DisputeRefundService.name);
  private cursor: string | undefined;

  constructor(
    private readonly db: DataSource,
    private readonly access: DisputeAccess,
    private readonly outboxService: OutboxService = new OutboxService(),
  ) {}

  async view(userId: string, decisionId: string, admin = false) {
    const manager = this.db.manager;
    const decision = await manager.findOneByOrFail(DisputeDecision, {
      id: decisionId,
    });
    const issue = await manager.findOneByOrFail(DisputeIssue, {
      id: decision.issueId,
    });
    const row = await manager.findOneByOrFail(DisputeCase, {
      id: issue.caseId,
    });
    const order = await manager.findOneByOrFail(Order, { id: row.orderId });
    if (admin) {
      await manager.findOneByOrFail(User, {
        id: userId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      });
    } else {
      await this.access.assertParty(manager, userId, row.orderId, order);
    }
    const entitlement = decision.finalRefundAmount ?? decision.refundAmount;
    const approved = entitlement
      ? refundAllocation(
          decision.itemPrice,
          entitlement,
          order.commissionBasisPoints,
        )
      : null;
    const returnCase = await manager.findOneBy(DisputeReturn, { decisionId });
    const credit = await manager.findOneBy(DisputeRefundCredit, { decisionId });
    return {
      decisionId,
      issueStatus: issue.status,
      finalRefundAmount: decision.finalRefundAmount,
      approvedSellerDebit: approved?.sellerDebit ?? null,
      returnCase,
      credit,
    };
  }

  async execute(decisionId: string) {
    return this.db.transaction(async (manager) => {
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
      return this.executeInTransaction(manager, decisionId, new Date(now));
    });
  }

  async executeInTransaction(
    manager: EntityManager,
    decisionId: string,
    now: Date,
  ): Promise<DisputeRefundCredit | null> {
    const meta = await manager
      .createQueryBuilder(DisputeCase, 'c')
      .innerJoin(DisputeIssue, 'i', 'i.caseId = c.id')
      .innerJoin(
        DisputeDecision,
        'd',
        'd.issueId = i.id AND d.id = :decisionId',
        { decisionId },
      )
      .select('c.id', 'caseId')
      .addSelect('c.orderId', 'orderId')
      .addSelect('i.id', 'issueId')
      .getRawOne<{ caseId: string; orderId: string; issueId: string }>();
    if (!meta) {
      await manager.findOneByOrFail(DisputeDecision, { id: decisionId });
      return null;
    }
    const order = await manager.findOneOrFail(Order, {
      where: { id: meta.orderId },
      lock: { mode: 'pessimistic_write' },
    });
    const issue = await manager.findOneOrFail(DisputeIssue, {
      where: { id: meta.issueId },
      lock: { mode: 'pessimistic_write' },
    });
    const decision = await manager.findOneOrFail(DisputeDecision, {
      where: { id: decisionId },
      lock: { mode: 'pessimistic_write' },
    });
    const existing = await manager.findOneBy(DisputeRefundCredit, {
      decisionId,
    });
    if (existing) return existing;
    if (
      !decision.finalizedAt ||
      !decision.finalOutcome ||
      decision.finalOutcome === DISPUTE_DECISION_OUTCOME.REJECT_CLAIM ||
      !decision.finalRefundAmount
    ) {
      return null;
    }
    if (issue.status !== DISPUTE_ISSUE_STATE.AWAITING_EXECUTION) return null;

    if (decision.finalOutcome === DISPUTE_DECISION_OUTCOME.REQUIRE_RETURN) {
      const returnCase = await manager.findOneBy(DisputeReturn, { decisionId });
      if (!returnCase) return null;
      if (
        returnCase.state === RETURN_STATE.AWAITING_HANDOVER &&
        !returnCase.handoverAt &&
        returnCase.handoverBy &&
        now > returnCase.handoverBy
      ) {
        returnCase.state = RETURN_STATE.EXPIRED;
        await manager.save(returnCase);
      }
      if (returnCase.state === RETURN_STATE.EXPIRED) {
        issue.status = DISPUTE_ISSUE_STATE.RESOLVED_NO_REFUND;
        await manager.save(issue);
        await restoreDisputeCaseIfClear(manager, issue.caseId);
        return null;
      }
      if (returnCase.state !== RETURN_STATE.READY) return null;
    }

    const funding = await refundFunding(manager, order, now);
    if (!funding) return null;

    const allocation = refundAllocation(
      decision.itemPrice,
      decision.finalRefundAmount,
      order.commissionBasisPoints,
    );

    const credit = await manager.save(
      DisputeRefundCredit,
      manager.create(DisputeRefundCredit, {
        decisionId: decision.id,
        orderId: order.id,
        buyerId: order.buyerId,
        shopId: order.shopId,
        mode: funding.mode,
        ...allocation,
        createdAt: now,
      }),
    );

    if (allocation.amount > 0) {
      await this.creditBuyerWallet(
        manager,
        order.buyerId,
        funding.mode,
        allocation.amount,
      );
    }
    await adjustPurchaseReward(manager, order, now);

    issue.status = DISPUTE_ISSUE_STATE.RESOLVED_REFUND;
    await manager.save(issue);
    await this.outboxService.record(manager, {
      eventType: EVENT_TYPES.DISPUTE_UPDATED,
      resourceId: meta.caseId,
      payload: {
        disputeCaseId: meta.caseId,
        orderId: order.id,
        buyerId: order.buyerId,
        shopId: order.shopId,
        event: `refunded:${credit.id}`,
        includeAdmins: false,
        sendEmail: true,
      },
    });
    await restoreDisputeCaseIfClear(manager, issue.caseId);
    return credit;
  }

  private async creditBuyerWallet(
    manager: EntityManager,
    userId: string,
    mode: string,
    amount: number,
  ) {
    await manager
      .createQueryBuilder()
      .insert()
      .into(WalletAccount)
      .values({ userId })
      .orIgnore()
      .execute();
    const account = await manager.findOneOrFail(WalletAccount, {
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
    const field =
      mode === RECONCILIATION_MODE.SIMULATION ? 'simulationBalance' : 'balance';
    const balance = account[field] + amount;
    const held =
      mode === RECONCILIATION_MODE.SIMULATION
        ? (account.simulationHeldBalance ?? 0)
        : (account.heldBalance ?? 0);
    if (!walletBalanceSchema.safeParse(balance + held).success) {
      throw new ConflictException('Wallet refund exceeds safe balance');
    }
    account[field] = balance;
    await manager.save(account);
  }

  async run() {
    const query = this.db.manager
      .createQueryBuilder(DisputeDecision, 'decision')
      .innerJoin(DisputeIssue, 'issue', 'issue.id = decision.issueId')
      .leftJoin(DisputeReturn, 'ret', 'ret.decisionId = decision.id')
      .where('issue.status = :status', {
        status: DISPUTE_ISSUE_STATE.AWAITING_EXECUTION,
      })
      .andWhere('decision.finalizedAt IS NOT NULL')
      .andWhere(
        '(decision.finalOutcome != :requireReturn OR ret.state IN (:...returnStates))',
        {
          requireReturn: DISPUTE_DECISION_OUTCOME.REQUIRE_RETURN,
          returnStates: [RETURN_STATE.READY, RETURN_STATE.EXPIRED],
        },
      )
      .select('decision.id', 'id')
      .orderBy('decision.id', 'ASC')
      .limit(DISPUTE_POLICY.BATCH_SIZE);

    if (this.cursor) {
      query.andWhere('decision.id > :cursor', { cursor: this.cursor });
    }
    const rows = await query.getRawMany<{ id: string }>();

    for (const row of rows) {
      this.cursor = row.id;
      try {
        await this.execute(row.id);
      } catch (error) {
        this.logger.error({
          decisionId: row.id,
          message:
            error instanceof Error ? error.message : 'Refund execution failed',
        });
      }
    }
    if (rows.length < DISPUTE_POLICY.BATCH_SIZE) this.cursor = undefined;
  }
}
