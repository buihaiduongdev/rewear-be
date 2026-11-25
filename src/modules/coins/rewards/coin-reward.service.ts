import { Injectable, Logger } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { OPEN_DISPUTE_STATES } from '@/modules/dispute/constants/dispute.constant';
import { refundFunding } from '@/modules/dispute/dispute-refund-funding';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund.entity';
import {
  DisputeCase,
  DisputeIssue,
} from '@/modules/dispute/entities/dispute.entity';
import { ORDER_POLICY } from '@/modules/order/constants/order.constant';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { Order } from '@/modules/order/entities/order.entity';
import { isSettlementWindowDue } from '@/modules/order/policies/order-settlement.policy';

import { CoinService } from '../core/coin.service';
import { adjustPurchaseReward } from './adjust-purchase-reward';
import { CoinPurchaseReward } from './entities';
import { purchaseRewardAmount } from './policies/purchase-reward.policy';

@Injectable()
export class CoinRewardService {
  private readonly logger = new Logger(CoinRewardService.name);
  private cursor?: string;
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
      const grant = await this.coins.grantPurchaseReward(
        manager,
        order.buyerId,
        orderId,
        target,
        funding.mode,
        now,
      );
      return manager.save(
        CoinPurchaseReward,
        manager.create(CoinPurchaseReward, {
          orderId,
          buyerId: order.buyerId,
          mode: funding.mode,
          grantId: grant.id,
          entitlement: target,
          evaluatedAt: now,
        }),
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
    const query = this.db.manager
      .createQueryBuilder(Order, 'order')
      .select('order.id', 'id')
      .where('order."disputeDeadlineAt" <= CURRENT_TIMESTAMP')
      .orderBy('order.id', 'ASC')
      .limit(ORDER_POLICY.SETTLEMENT_BATCH_SIZE);
    if (this.cursor)
      query.andWhere('order.id > :cursor', { cursor: this.cursor });
    const rows = await query.getRawMany<{ id: string }>();
    for (const row of rows) {
      this.cursor = row.id;
      try {
        await this.evaluate(row.id);
      } catch {
        this.logger.error(`Purchase reward requires retry for order ${row.id}`);
      }
    }
    if (rows.length < ORDER_POLICY.SETTLEMENT_BATCH_SIZE)
      this.cursor = undefined;
  }
}
