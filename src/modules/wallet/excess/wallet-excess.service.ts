import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';
import z from 'zod';

import { fulfillmentDeadline } from '@/modules/shipment/utils/fulfillment-calendar';

import { walletPoolFields } from '../checkout/policies/wallet-checkout.policy';
import { WalletAccount } from '../entities/wallet.entity';
import { verifiedWalletFunds } from '../verified-wallet-funds';
import {
  EXCESS_EVENT,
  EXCESS_METHOD,
  EXCESS_POLICY,
  EXCESS_REVIEW,
} from './constants/excess.constant';
import {
  ExcessAudit,
  ExcessCollection,
  WalletExcess,
} from './entities/excess.entity';
import { excessEvent } from './excess.lifecycle';
import { settleExcessReservations } from './payments/settle-excess-reservations';
import {
  collectExcessWallet,
  excessTotals,
  returnExcessCollections,
} from './policies/excess-accounting.policy';
import { excessSource } from './policies/excess-source.policy';
import {
  excessAccess,
  excessActor,
  excessClock,
  excessReplay,
  saveExcessCommand,
} from './policies/excess-transaction.policy';
import {
  excessCorrectSchema,
  excessObjectSchema,
  excessQuerySchema,
  excessVerifySchema,
} from './schemas/excess.schema';

@Injectable()
export class WalletExcessService {
  constructor(private readonly db: DataSource) {}
  async detail(manager: EntityManager, row: WalletExcess) {
    const audits = await manager.find(ExcessAudit, {
      where: { excessId: row.id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return {
      ...row,
      ...(await excessTotals(manager, row)),
      history: audits.map((a) => ({
        id: a.id,
        action: a.action,
        reason: a.reason,
        detail: a.detail,
        createdAt: a.createdAt,
      })),
    };
  }
  verify(actorId: string, input: z.input<typeof excessVerifySchema>) {
    const data = excessVerifySchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await excessClock(manager);
      await excessActor(manager, actorId, true);
      const command = await excessReplay(manager, actorId, data.requestId, {
        action: EXCESS_EVENT.VERIFIED,
        data,
      });
      if (command)
        return this.detail(
          manager,
          await excessAccess(manager, actorId, command.excessId, true),
        );
      const source = await excessSource(
        manager,
        data.sourceType,
        data.sourceId,
      );
      if (data.authorizedAmount >= source.amount)
        throw new ConflictException('No verified excess amount');
      if (
        await manager.existsBy(WalletExcess, {
          sourceType: data.sourceType,
          sourceId: data.sourceId,
        })
      )
        throw new ConflictException('Refund source already assessed');
      const row = await manager.save(
        WalletExcess,
        manager.create(WalletExcess, {
          buyerId: source.buyerId,
          mode: source.mode,
          sourceType: data.sourceType,
          sourceId: data.sourceId,
          sourceAmount: source.amount,
          authorizedAmount: data.authorizedAmount,
          version: 1,
          reason: data.reason,
          evidence: data.evidence,
          verifiedAt: now,
          objectionBy: new Date(
            now.getTime() + EXCESS_POLICY.OBJECTION_WINDOW_MS,
          ),
          reviewState: EXCESS_REVIEW.NONE,
          objectedAt: null,
          objectionReason: null,
          objectionEvidence: null,
          reviewDueAt: null,
          reviewOverdueAt: null,
          responseDueAt: null,
        }),
      );
      await excessEvent(
        manager,
        row,
        actorId,
        EXCESS_EVENT.VERIFIED,
        data.reason,
        {
          evidence: data.evidence,
          sourceAmount: source.amount,
          authorizedAmount: data.authorizedAmount,
        },
      );
      await this.recoverUnspent(manager, row);
      await saveExcessCommand(manager, actorId, data.requestId, row.id, {
        action: EXCESS_EVENT.VERIFIED,
        data,
      });
      return this.detail(manager, row);
    });
  }
  private async recoverUnspent(manager: EntityManager, row: WalletExcess) {
    const account = await manager.findOneBy(WalletAccount, {
      userId: row.buyerId,
    });
    if (!account) return;
    const funds = await verifiedWalletFunds(manager, row.buyerId, row.mode);
    const [, held] = walletPoolFields(row.mode);
    // Existing checkout debits are not attributed to individual credits. Treat
    // all prior spending/holds as consuming this source first: never seize
    // another refund's balance by assuming this source is still unused.
    const [spent] = await manager.query(
      `SELECT COALESCE((SELECT SUM(amount) FROM wallet_debits WHERE "buyerId"=$1 AND mode=$2),0)+COALESCE((SELECT SUM(amount) FROM fee_wallet_debits WHERE "buyerId"=$1 AND mode=$2),0) amount`,
      [row.buyerId, row.mode],
    );
    const recoveryDebits = Number(
      (await manager.sum(ExcessCollection, 'amount', {
        buyerId: row.buyerId,
        mode: row.mode,
        method: EXCESS_METHOD.WALLET,
      })) ?? 0,
    );
    const availableSource = Math.max(
      0,
      row.sourceAmount - Number(spent.amount) - recoveryDebits - account[held],
    );
    const amount = Math.min(
      row.sourceAmount - row.authorizedAmount,
      funds.spendable,
      availableSource,
    );
    await collectExcessWallet(manager, row, amount, row.sourceId);
  }
  object(
    actorId: string,
    id: string,
    input: z.input<typeof excessObjectSchema>,
  ) {
    const data = excessObjectSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await excessClock(manager);
      const row = await excessAccess(manager, actorId, id);
      const payload = { action: EXCESS_EVENT.OBJECTED, id, data };
      if (await excessReplay(manager, actorId, data.requestId, payload))
        return this.detail(manager, row);
      const unavailable =
        row.objectedDecisionVersion === row.decisionVersion ||
        now > row.objectionBy;
      if (unavailable)
        throw new ConflictException('Recovery objection unavailable');
      row.reviewState = EXCESS_REVIEW.OPEN;
      row.reviewOverdueAt = null;
      row.responseDueAt = null;
      row.objectedDecisionVersion = row.decisionVersion;
      row.objectedAt = now;
      row.objectionReason = data.reason;
      row.objectionEvidence = data.evidence;
      row.reviewDueAt = await fulfillmentDeadline(
        manager,
        now,
        EXCESS_POLICY.REVIEW_BUSINESS_DAYS,
      );
      row.version++;
      await manager.save(row);
      await excessEvent(
        manager,
        row,
        actorId,
        EXCESS_EVENT.OBJECTED,
        data.reason,
        { evidence: data.evidence },
      );
      await saveExcessCommand(manager, actorId, data.requestId, id, payload);
      return this.detail(manager, row);
    });
  }
  correct(
    actorId: string,
    id: string,
    input: z.input<typeof excessCorrectSchema>,
  ) {
    const data = excessCorrectSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await excessClock(manager);
      const row = await excessAccess(manager, actorId, id, true);
      const payload = { action: EXCESS_EVENT.CORRECTED, id, data };
      if (await excessReplay(manager, actorId, data.requestId, payload))
        return this.detail(manager, row);
      if (row.version !== data.expectedVersion)
        throw new ConflictException('Recovery version changed');
      if (data.authorizedAmount > row.sourceAmount)
        throw new ConflictException(
          'Authorized amount exceeds original source',
        );
      const original = await excessSource(
        manager,
        row.sourceType,
        row.sourceId,
      );
      if (
        original.amount !== row.sourceAmount ||
        original.buyerId !== row.buyerId ||
        original.mode !== row.mode
      )
        throw new ConflictException(
          'Original source changed; reconciliation required',
        );
      row.authorizedAmount = data.authorizedAmount;
      row.version++;
      if (row.reviewState === EXCESS_REVIEW.OPEN)
        row.reviewState = EXCESS_REVIEW.CLOSED;
      else {
        row.decisionVersion++;
        row.objectionBy = new Date(
          now.getTime() + EXCESS_POLICY.OBJECTION_WINDOW_MS,
        );
        row.reviewState = EXCESS_REVIEW.NONE;
      }
      row.supplementRequest = null;
      row.reason = data.reason;
      row.evidence = data.evidence;
      await manager.save(row);
      await returnExcessCollections(manager, row);
      await settleExcessReservations(manager, row, now);
      await excessEvent(
        manager,
        row,
        actorId,
        EXCESS_EVENT.CORRECTED,
        data.reason,
        { evidence: data.evidence, authorizedAmount: row.authorizedAmount },
      );
      await saveExcessCommand(manager, actorId, data.requestId, id, payload);
      return this.detail(manager, row);
    });
  }
  find(actorId: string, id: string, admin = false) {
    return this.db.transaction('REPEATABLE READ', async (manager) =>
      this.detail(manager, await excessAccess(manager, actorId, id, admin)),
    );
  }
  list(
    actorId: string,
    input: z.input<typeof excessQuerySchema>,
    admin = false,
  ) {
    const data = excessQuerySchema.parse(input);
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      await excessActor(manager, actorId, admin);
      const [rows, totalCount] = await manager.findAndCount(WalletExcess, {
        where: admin ? {} : { buyerId: actorId },
        order: { verifiedAt: 'DESC', id: 'DESC' },
        take: data.limit,
        skip: data.offset,
      });
      const items = await Promise.all(
        rows.map(async (row) => ({
          ...row,
          ...(await excessTotals(manager, row)),
        })),
      );
      return { items, totalCount, ...data };
    });
  }
}
