import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import {
  safeBalanceSchema,
  vndAmountSchema,
} from '@/common/schemas/money.schema';
import {
  COD_RECONCILIATION_STATUS,
  RECONCILIATION_MODE,
  RECONCILIATION_REVIEW_REASON,
} from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { CodCollection } from '@/modules/cod-reconciliation/entities';
import {
  collectionViewSchema,
  type FinanceListInput,
  financeListSchema,
  type ReconciliationMode,
} from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { shopRefundDeductions } from '@/modules/dispute/dispute-refund-accounting';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund-credit.entity';
import { Order } from '@/modules/order/entities';
import { ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';

import { SHOP_LEDGER_ENTRY_TYPE } from './constants/payout-source.constant';
import { ShopLedgerEntry } from './entities/shop-ledger.entity';
import { ShopSettlement } from './entities/shop-settlement.entity';
import { readPayoutSources } from './payout-sources';

@Injectable()
export class ShopFinanceService {
  constructor(private readonly db: DataSource) {}

  async recordCodShippingDebit(
    manager: EntityManager,
    order: Pick<Order, 'id' | 'shopId' | 'shippingFee'>,
    oneWayShippingFee: number,
    mode: ReconciliationMode = RECONCILIATION_MODE.SIMULATION,
    actorId: string | null = null,
  ) {
    const twoWayCost = oneWayShippingFee * 2;
    if (!vndAmountSchema.safeParse(twoWayCost).success)
      throw new ConflictException('Invalid 2-way COD shipping debit amount');
    if (twoWayCost === 0) return null;
    if (manager.queryRunner?.isTransactionActive && manager.findOne) {
      await manager.findOne(Order, {
        where: { id: order.id },
        lock: { mode: 'pessimistic_write' },
      });
    }
    const existing = await manager.findOneBy(ShopLedgerEntry, {
      orderId: order.id,
      type: SHOP_LEDGER_ENTRY_TYPE.COD_SHIPPING_DEBIT,
    });
    if (existing) {
      if (
        existing.shopId !== order.shopId ||
        existing.mode !== mode ||
        existing.amount !== twoWayCost
      )
        throw new ConflictException(
          'Shop COD shipping debit requires reconciliation',
        );
      return existing;
    }
    return manager.save(
      ShopLedgerEntry,
      manager.create(ShopLedgerEntry, {
        shopId: order.shopId,
        orderId: order.id,
        collectionId: null,
        mode,
        type: SHOP_LEDGER_ENTRY_TYPE.COD_SHIPPING_DEBIT,
        amount: twoWayCost,
        actorId,
      }),
    );
  }

  async view(userId: string, shopId: string, input: FinanceListInput) {
    const data = financeListSchema.parse(input);
    const mode = data.mode ?? RECONCILIATION_MODE.EVIDENCE;
    const manager = this.db.manager;
    const owner = await manager.existsBy(ShopMember, {
      shopId,
      userId,
      memberRole: ShopMemberRole.OWNER,
    });
    if (!owner)
      throw new ForbiddenException('Shop finance Owner access required');
    const totals = await this.readTotals(manager, shopId, mode);
    const history = await this.readHistory(
      manager,
      shopId,
      mode,
      data.offset ?? 0,
    );
    return { shopId, mode, ...totals, ...history };
  }

  private async readTotals(
    manager: EntityManager,
    shopId: string,
    mode: ReconciliationMode,
  ) {
    const { funded, released, releasedRefundDebit, pending } =
      await this.readFundingTotals(manager, shopId, mode);
    const deductions = await shopRefundDeductions(manager, shopId, mode);
    const lateDebit = deductions.settled - releasedRefundDebit;
    const payoutFunds = await readPayoutSources(manager, shopId, mode);
    const { available } = payoutFunds;
    const held = funded - deductions.funded - released + lateDebit;
    const receivable = pending - deductions.receivable;
    if (
      ![held, receivable, available, funded].every(
        (amount) => safeBalanceSchema.safeParse(amount).success,
      )
    )
      throw new ConflictException('Shop totals exceed safe amount range');
    return {
      held,
      receivable,
      available,
      payoutLocked: payoutFunds.payoutLocked,
      paidOut: payoutFunds.paidOut,
      paidOutDebt: payoutFunds.paidOutDebt,
      heldShortfall: payoutFunds.heldShortfall,
      reviewHeld: payoutFunds.reviewHeld,
      shippingDebit: payoutFunds.shippingDebit,
    };
  }

  private async readFundingTotals(
    manager: EntityManager,
    shopId: string,
    mode: ReconciliationMode,
  ) {
    const heldRow = await manager
      .createQueryBuilder(ShopLedgerEntry, 'entry')
      .select(
        'COALESCE(SUM(CASE WHEN entry.type = :debitType THEN 0 ELSE entry.amount END), 0)',
        'total',
      )
      .where('entry.shopId = :shopId AND entry.mode = :mode', {
        shopId,
        mode,
        debitType: SHOP_LEDGER_ENTRY_TYPE.COD_SHIPPING_DEBIT,
      })
      .getRawOne<{ total: string }>();
    const pendingRow = await manager
      .createQueryBuilder(CodCollection, 'collection')
      .select('COALESCE(SUM(collection.sellerNet),0)', 'total')
      .where('collection.shopId = :shopId AND collection.mode = :mode', {
        shopId,
        mode,
      })
      .andWhere(
        `(collection.status IN (:...statuses) OR (collection.status = :review AND collection.reviewReason = :reviewReason AND EXISTS (SELECT 1 FROM dispute_refund_credits refund WHERE refund."orderId" = collection."orderId" AND refund.mode = collection.mode)))`,
        {
          review: COD_RECONCILIATION_STATUS.REVIEW,
          reviewReason:
            RECONCILIATION_REVIEW_REASON.CARRIER_OR_ORDER_REQUIRES_REVIEW,
          statuses: [
            COD_RECONCILIATION_STATUS.AWAITING,
            COD_RECONCILIATION_STATUS.PARTIAL,
          ],
        },
      )
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM shop_ledger_entries entry WHERE entry."orderId" = collection."orderId" AND entry.mode = collection.mode AND entry.type <> :debitType)',
        { debitType: SHOP_LEDGER_ENTRY_TYPE.COD_SHIPPING_DEBIT },
      )
      .getRawOne<{ total: string }>();
    const releasedRow = await manager
      .createQueryBuilder(ShopSettlement, 'release')
      .select('COALESCE(SUM(release.amount),0)', 'total')
      .addSelect('COALESCE(SUM(release.refundDebit),0)', 'refundDebit')
      .where('release.shopId = :shopId AND release.mode = :mode', {
        shopId,
        mode,
      })
      .getRawOne<{ total: string; refundDebit: string }>();
    return {
      funded: Number(heldRow?.total ?? 0),
      released: Number(releasedRow?.total ?? 0),
      releasedRefundDebit: Number(releasedRow?.refundDebit ?? 0),
      pending: Number(pendingRow?.total ?? 0),
    };
  }

  private async readHistory(
    manager: EntityManager,
    shopId: string,
    mode: ReconciliationMode,
    offset: number,
  ) {
    const entries = await manager.find(ShopLedgerEntry, {
      where: { shopId, mode },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
      skip: offset,
    });
    const collections = await manager.find(CodCollection, {
      where: { shopId, mode },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
      skip: offset,
    });
    const settlements = await manager.find(ShopSettlement, {
      where: { shopId, mode },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
      skip: offset,
    });
    const refunds = await manager.find(DisputeRefundCredit, {
      where: { shopId, mode },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
      skip: offset,
    });
    return {
      refunds,
      settlements: settlements.map(({ id, orderId, amount, createdAt }) => ({
        id,
        orderId,
        amount,
        createdAt,
      })),
      entries: entries.map(({ id, orderId, type, amount, createdAt }) => ({
        id,
        orderId,
        type,
        amount,
        createdAt,
      })),
      collections: collections.map((row) => collectionViewSchema.parse(row)),
    };
  }
}
