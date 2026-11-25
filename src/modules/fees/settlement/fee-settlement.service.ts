import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { DataSource, EntityManager, In, IsNull, MoreThan } from 'typeorm';

import { CodRemittance } from '@/modules/cod-reconciliation/entities';
import {
  CarrierCompensationReceipt,
  ReturnShippingCharge,
} from '@/modules/dispute/returns/entities/return-exception.entity';

import {
  FEE_COLLECTION_METHOD,
  FEE_PARTY,
  FEE_REFUND_STATE,
  FEE_STATUS,
} from '../constants/fee.constant';
import { FeeAssessment, FeeRefund } from '../entities';
import { FeeService } from '../fee.service';
import {
  FEE_SETTLEMENT_POLICY,
  FEE_SETTLEMENT_RECORD,
} from './constants/fee-settlement.constant';
import { FeeSettlementIncident } from './entities';
import { settleInternalFeeRefund } from './fee-internal-refunds';
import { settleShopFees } from './fee-offset';
import { importVerifiedReturnFee } from './fee-return-bridge';
import { assertFeeAdmin, feeMoneyLock } from './fee-settlement.access';
import { feeCarrierRefundSchema } from './schemas/fee-settlement.schema';
import type { FeeCarrierRefundInput } from './schemas/fee-settlement.schema';

@Injectable()
export class FeeSettlementService {
  private cursor: string | null = null;
  private readonly logger = new Logger(FeeSettlementService.name);
  constructor(
    private readonly db: DataSource,
    private readonly fees: FeeService,
  ) {}

  async run() {
    let failed = 0;
    const charges = await this.db.getRepository(ReturnShippingCharge).find({
      where: this.cursor ? { id: MoreThan(this.cursor) } : {},
      order: { id: 'ASC' },
      take: FEE_SETTLEMENT_POLICY.BATCH_SIZE,
    });
    for (const charge of charges)
      failed += await this.isolate(
        FEE_SETTLEMENT_RECORD.RETURN_CHARGE,
        charge.id,
        async (manager, now) => {
          await importVerifiedReturnFee(manager, [charge], this.fees, now);
        },
      );
    this.cursor =
      charges.length === FEE_SETTLEMENT_POLICY.BATCH_SIZE
        ? charges[charges.length - 1].id
        : null;
    const refunds = await this.db.getRepository(FeeRefund).findBy({
      state: FEE_REFUND_STATE.PENDING,
      method: In([
        FEE_COLLECTION_METHOD.WALLET,
        FEE_COLLECTION_METHOD.SHOP_OFFSET,
      ]),
    });
    for (const refund of refunds)
      failed += await this.isolate(
        FEE_SETTLEMENT_RECORD.REFUND,
        refund.id,
        async (manager, now) => {
          await settleInternalFeeRefund(
            manager,
            await manager.findOneByOrFail(FeeRefund, { id: refund.id }),
            now,
          );
        },
      );
    const fees = await this.db
      .getRepository(FeeAssessment)
      .findBy({ party: FEE_PARTY.SHOP, status: FEE_STATUS.ACTIVE });
    const groups = new Map(
      fees.map((fee) => [`${fee.shopId}:${fee.mode}`, fee]),
    );
    for (const [key, fee] of groups)
      failed += await this.isolate(
        FEE_SETTLEMENT_RECORD.SHOP,
        key,
        async (manager, now) => {
          await settleShopFees(manager, fee.shopId, fee.mode, now);
        },
      );
    return { failed };
  }

  private async isolate(
    kind: string,
    recordId: string,
    work: (manager: EntityManager, now: Date) => Promise<void>,
  ) {
    try {
      await this.db.transaction(async (manager) => {
        const now = await feeMoneyLock(manager);
        await work(manager, now);
        await manager.update(
          FeeSettlementIncident,
          { kind, recordId, resolvedAt: IsNull() },
          { resolvedAt: now },
        );
      });
      return 0;
    } catch {
      this.logger.error('Fee settlement remains pending; incident recorded');
      await this.db.transaction(async (manager) => {
        const now = await feeMoneyLock(manager);
        const incident =
          (await manager.findOneBy(FeeSettlementIncident, {
            kind,
            recordId,
          })) ??
          manager.create(FeeSettlementIncident, {
            kind,
            recordId,
            attempts: 0,
          });
        incident.attempts += 1;
        incident.lastAttemptAt = now;
        incident.resolvedAt = null;
        await manager.save(incident);
      });
      return 1;
    }
  }

  async incidents(actorId: string) {
    await assertFeeAdmin(this.db.manager, actorId);
    return this.db.getRepository(FeeSettlementIncident).find({
      where: { resolvedAt: IsNull() },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: FEE_SETTLEMENT_POLICY.BATCH_SIZE,
    });
  }

  recordCarrierRefund(
    actorId: string,
    id: string,
    input: FeeCarrierRefundInput,
  ) {
    const data = feeCarrierRefundSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await feeMoneyLock(manager);
      await assertFeeAdmin(manager, actorId);
      const refund = await manager.findOneByOrFail(FeeRefund, {
        id,
        method: FEE_COLLECTION_METHOD.CARRIER_NETTING,
      });
      if (
        refund.amount !== data.amount ||
        new Date(data.receivedAt) > now ||
        new Date(data.receivedAt) < refund.requestedAt
      )
        throw new ConflictException(
          'Carrier refund receipt must match original source and actual amount/time',
        );
      const reference = data.reference.toUpperCase();
      if (refund.state === FEE_REFUND_STATE.SUCCEEDED) {
        if (
          refund.providerReference !== reference ||
          refund.evidence !== data.evidence
        )
          throw new ConflictException('Carrier refund receipt is immutable');
        return refund;
      }
      const duplicate = await manager.existsBy(FeeRefund, {
        mode: refund.mode,
        providerReference: reference,
      });
      const carrierDuplicate = await manager.existsBy(
        CarrierCompensationReceipt,
        { mode: refund.mode, reference },
      );
      const codDuplicate = await manager.existsBy(CodRemittance, {
        mode: refund.mode,
        reference,
      });
      if (duplicate || carrierDuplicate || codDuplicate)
        throw new ConflictException(
          'Receipt reference already funds another record',
        );
      refund.state = FEE_REFUND_STATE.SUCCEEDED;
      refund.providerReference = reference;
      refund.evidence = data.evidence;
      refund.completedAt = now;
      await manager.save(refund);
      return refund;
    });
  }
}
