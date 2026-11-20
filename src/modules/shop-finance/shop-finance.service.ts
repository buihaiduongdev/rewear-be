import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { safeBalanceSchema } from '@/common/schemas/money.schema';
import { RECONCILIATION_REVIEW_REASON } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import {
  COD_RECONCILIATION_STATUS,
  RECONCILIATION_MODE,
} from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { CodCollection } from '@/modules/cod-reconciliation/entities/cod-reconciliation.entity';
import {
  collectionViewSchema,
  financeListSchema,
} from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import type {
  FinanceListInput,
  ReconciliationMode,
} from '@/modules/cod-reconciliation/types/cod-reconciliation.type';
import { shopRefundDeductions } from '@/modules/dispute/dispute-refund-accounting';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund.entity';
import { CARRIER_RECEIPT_KIND } from '@/modules/dispute/returns/constants/return-exception.constant';
import {
  CarrierCompensationReceipt,
  ReturnShippingCharge,
} from '@/modules/dispute/returns/entities/return-exception.entity';
import { FEE_PARTY } from '@/modules/fees/constants/fee.constant';
import { FeeAssessment } from '@/modules/fees/entities/fee.entity';
import { feeOutstanding } from '@/modules/fees/fee-accounting';
import { returnFeeOutstanding } from '@/modules/fees/settlement/fee-return-bridge';
import { ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';

import { ShopLedgerEntry } from './entities/shop-ledger.entity';
import { ShopSettlement } from './entities/shop-settlement.entity';
import { readPayoutSources } from './payout-sources';

@Injectable()
export class ShopFinanceService {
  constructor(private readonly db: DataSource) {}
  async view(userId: string, shopId: string, input: FinanceListInput) {
    const data = financeListSchema.parse(input);
    const mode = data.mode ?? RECONCILIATION_MODE.EVIDENCE;
    return this.db.transaction('REPEATABLE READ', async (manager) => {
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
    });
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
    const { carrierCompensation, returnFeePayable } =
      await this.readCarrierTotals(manager, shopId, mode);
    const payoutFunds = await readPayoutSources(manager, shopId, mode);
    const feeRows = await manager.findBy(FeeAssessment, {
      shopId,
      mode,
      party: FEE_PARTY.SHOP,
    });
    let feePayable = 0;
    for (const fee of feeRows)
      feePayable += await feeOutstanding(manager, fee.id);
    const { available } = payoutFunds;
    const held = funded - deductions.funded - released + lateDebit;
    const receivable = pending - deductions.receivable;
    const hasInvalidHeldTotal = !safeBalanceSchema.safeParse(held).success;
    const hasInvalidReceivableTotal =
      !safeBalanceSchema.safeParse(receivable).success;
    const hasInvalidAvailableTotal =
      !safeBalanceSchema.safeParse(available).success;
    const hasInvalidFundedTotal = !safeBalanceSchema.safeParse(funded).success;
    const exceedsSafeRange =
      hasInvalidHeldTotal ||
      hasInvalidReceivableTotal ||
      hasInvalidAvailableTotal ||
      hasInvalidFundedTotal;
    if (exceedsSafeRange)
      throw new ConflictException('Shop totals exceed safe amount range');
    return {
      held,
      receivable,
      available,
      carrierCompensation,
      returnFeePayable,
      payoutLocked: payoutFunds.payoutLocked,
      paidOut: payoutFunds.paidOut,
      paidOutDebt: payoutFunds.paidOutDebt,
      heldShortfall: payoutFunds.heldShortfall,
      reviewHeld: payoutFunds.reviewHeld,
      feePayable,
      feeDebited: payoutFunds.feeDebited,
      feeSourceDebt: payoutFunds.feeSourceDebt,
    };
  }

  private async readFundingTotals(
    manager: EntityManager,
    shopId: string,
    mode: ReconciliationMode,
  ) {
    const heldRow = await manager
      .createQueryBuilder(ShopLedgerEntry, 'entry')
      .select('COALESCE(SUM(entry.amount),0)', 'total')
      .where('entry.shopId = :shopId AND entry.mode = :mode', { shopId, mode })
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
        'NOT EXISTS (SELECT 1 FROM shop_ledger_entries entry WHERE entry."orderId" = collection."orderId" AND entry.mode = collection.mode)',
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

  private async readCarrierTotals(
    manager: EntityManager,
    shopId: string,
    mode: ReconciliationMode,
  ) {
    const carrierReceipts = await manager.find(CarrierCompensationReceipt, {
      where: { shopId, mode },
    });
    const carrierCompensation = carrierReceipts.reduce(
      (sum, receipt) => sum + receipt.amount,
      0,
    );
    const returnCharges = await manager.find(ReturnShippingCharge, {
      where: { shopId, mode },
    });
    let returnFeePayable = 0;
    for (const charge of returnCharges) {
      const chargeNetting = carrierReceipts
        .filter(
          (row) =>
            row.chargeId === charge.id &&
            row.kind === CARRIER_RECEIPT_KIND.VERIFIED_NETTING,
        )
        .reduce((sum, row) => sum + row.amount, 0);
      returnFeePayable += await returnFeeOutstanding(
        manager,
        charge,
        charge.amount - chargeNetting,
      );
    }
    return { carrierCompensation, returnFeePayable };
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
    const carrierReceipts = await manager.find(CarrierCompensationReceipt, {
      where: { shopId, mode },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
      skip: offset,
    });
    const returnCharges = await manager.find(ReturnShippingCharge, {
      where: { shopId, mode },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
      skip: offset,
    });
    return {
      carrierReceipts,
      returnCharges,
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
