import { Injectable, Logger } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { OPEN_DISPUTE_STATES } from '@/modules/dispute/constants/dispute.constant';
import { refundFunding } from '@/modules/dispute/dispute-refund-funding';
import { DisputeCase } from '@/modules/dispute/entities/dispute-case.entity';
import { DisputeIssue } from '@/modules/dispute/entities/dispute-issue.entity';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund-credit.entity';
import { ORDER_POLICY } from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { isSettlementWindowDue } from '@/modules/order/policies/order-settlement.policy';

import { CoinService } from '../core/coin.service';
import { CoinPurchaseReward } from '../core/entities';
import {
  adjustPurchaseReward,
  purchaseRewardAmount,
} from './adjust-purchase-reward';

@Injectable()
export class CoinRewardService {
  private readonly logger = new Logger(CoinRewardService.name);

  constructor(
    private readonly db: DataSource,
    private readonly coins: CoinService,
  ) {}

  async evaluate(orderId: string) {
    return this.db.transaction(async (manager) => {
      const [{ now: timestamp }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(timestamp);
      const order = await manager.findOneOrFail(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      const prior = await manager.findOneBy(CoinPurchaseReward, { orderId });
      if (prior) return adjustPurchaseReward(manager, order, now);
      const verification = await manager.findOneBy(OrderDeliveryVerification, {
        orderId,
      });
      if (!isSettlementWindowDue(order, verification, now)) return null;
      if (await this.hasOpenDispute(manager, orderId)) return null;
      const funding = await refundFunding(manager, order, now);
      if (!funding || funding.mode !== verification?.mode) return null;
      const refunds = await manager.findBy(DisputeRefundCredit, {
        orderId,
        mode: funding.mode,
      });
      const target = purchaseRewardAmount(
        order.subtotal,
        order.coinDiscount ?? 0,
        refunds.reduce((sum, row) => sum + row.amount, 0),
      );
      if (!target) return null;
      return this.coins.grantPurchaseReward(
        manager,
        order.buyerId,
        orderId,
        target,
        funding.mode,
        now,
      );
    });
  }

  private hasOpenDispute(manager: EntityManager, orderId: string) {
    return manager
      .createQueryBuilder(DisputeIssue, 'issue')
      .innerJoin(DisputeCase, 'dispute', 'dispute.id = issue.caseId')
      .where('dispute.orderId = :orderId', { orderId })
      .andWhere('issue.status IN (:...states)', {
        states: [...OPEN_DISPUTE_STATES],
      })
      .getExists();
  }

  async evaluateDue() {
    const rows = await this.db.manager
      .createQueryBuilder(Order, 'order')
      .innerJoin(
        OrderDeliveryVerification,
        'verification',
        'verification.orderId = order.id',
      )
      .leftJoin(CoinPurchaseReward, 'reward', 'reward.orderId = order.id')
      .select('order.id', 'id')
      .where('order."disputeDeadlineAt" <= CURRENT_TIMESTAMP')
      .andWhere('reward.id IS NULL')
      .orderBy('order."disputeDeadlineAt"', 'DESC')
      .limit(ORDER_POLICY.SETTLEMENT_BATCH_SIZE)
      .getRawMany<{ id: string }>();

    for (const row of rows) {
      try {
        await this.evaluate(row.id);
      } catch {
        this.logger.error(`Purchase reward requires retry for order ${row.id}`);
      }
    }
  }
}
