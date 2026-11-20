import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, EntityManager, In, IsNull } from 'typeorm';

import { settleShopFees } from '@/modules/fees/settlement/fee-offset';
import { fulfillmentDeadline } from '@/modules/shipment/utils/fulfillment-calendar';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole, ShopStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { readPayoutSources } from '../payout-sources';
import {
  ACTIVE_PAYOUT_STATUSES,
  BANK_VERIFICATION,
  PAYOUT_EVENT,
  PAYOUT_POLICY,
  PAYOUT_STATUS,
} from './constants/payout.constant';
import { ShopBankAccount } from './entities/shop-bank-account.entity';
import {
  ShopPayout,
  ShopPayoutAllocation,
  ShopPayoutEvent,
  ShopPayoutRisk,
} from './entities/shop-payout.entity';
import {
  allocatePayout,
  assertExactTransfer,
  canReleasePayout,
} from './payout-policy';
import {
  bankAccountInputSchema,
  bankReviewSchema,
  payoutFailureSchema,
  payoutRequestSchema,
  payoutSuccessSchema,
} from './schemas/payout.schema';
import type {
  BankAccountInput,
  PayoutRequestInput,
  PayoutSuccessInput,
} from './schemas/payout.schema';
import type { PayoutStatus } from './types/payout.type';

@Injectable()
export class ShopPayoutService {
  constructor(private readonly db: DataSource) {}
  private payoutView(payout: ShopPayout) {
    return {
      ...payout,
      calendarMissing: payout.dueAt == null,
      followUpOverdue: payout.followUpOverdueAt != null,
    };
  }
  private async assertAdmin(manager: EntityManager, actorId: string) {
    const admin = await manager.findOneBy(User, {
      id: actorId,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });
    if (!admin) throw new ForbiddenException('Active Admin required');
  }

  private async lock(manager: EntityManager): Promise<Date> {
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
    const [row] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(row.now);
  }
  private async assertOwner(
    manager: EntityManager,
    userId: string,
    shopId: string,
  ) {
    const member = await manager.findOneBy(ShopMember, {
      shopId,
      userId,
      memberRole: ShopMemberRole.OWNER,
    });
    const user =
      member &&
      (await manager.findOneBy(User, {
        id: userId,
        status: UserStatus.ACTIVE,
      }));
    if (!member || !user)
      throw new ForbiddenException('Current active Shop Owner required');
  }
  private async assertSafe(
    manager: EntityManager,
    payout: Pick<ShopPayout, 'shopId' | 'bankAccountId' | 'ownerId'>,
  ) {
    const shop = await manager.findOneBy(Shop, {
      id: payout.shopId,
      status: ShopStatus.ACTIVE,
    });
    const bank = await manager.findOneBy(ShopBankAccount, {
      id: payout.bankAccountId,
      shopId: payout.shopId,
    });
    await this.assertOwner(manager, payout.ownerId, payout.shopId);
    const shopRisk = await manager.findOneBy(ShopPayoutRisk, {
      shopId: payout.shopId,
    });
    if (!shop || !bank || bank.riskReason || bank.deletedAt || shopRisk?.reason)
      throw new ConflictException('Shop or recipient requires risk review');
    return bank;
  }
  async setShopRisk(
    actorId: string,
    shopId: string,
    input: { evidence: string; riskReason: string | null },
  ) {
    const data = bankReviewSchema.parse(input);
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      await this.assertAdmin(manager, actorId);
      if (!(await manager.existsBy(Shop, { id: shopId })))
        throw new NotFoundException('Shop not found');
      const risk =
        (await manager.findOneBy(ShopPayoutRisk, { shopId })) ??
        manager.create(ShopPayoutRisk, { shopId });
      Object.assign(risk, {
        reason: data.riskReason,
        evidence: data.evidence,
        actorId,
      });
      await manager.save(risk);
      return { shopId, riskReason: risk.reason };
    });
  }
  private async event(
    manager: EntityManager,
    payout: ShopPayout,
    type: string,
    actorId: string | null,
    message: string,
  ) {
    await manager.save(
      ShopPayoutEvent,
      manager.create(ShopPayoutEvent, {
        payoutId: payout.id,
        shopId: payout.shopId,
        type,
        actorId,
        message,
      }),
    );
  }
  private async find(manager: EntityManager, id: string) {
    const payout = await manager.findOneBy(ShopPayout, { id });
    if (!payout) throw new NotFoundException('Payout not found');
    return payout;
  }
  async ownerView(userId: string, shopId: string) {
    return this.db.transaction(async (manager) => {
      await this.assertOwner(manager, userId, shopId);
      const accounts = await manager.find(ShopBankAccount, {
        where: { shopId, deletedAt: IsNull() },
        order: { createdAt: 'DESC' },
      });
      const payouts = await manager.find(ShopPayout, {
        where: { shopId },
        order: { createdAt: 'DESC' },
        take: 100,
      });
      const events = await manager.find(ShopPayoutEvent, {
        where: { shopId },
        order: { createdAt: 'DESC' },
        take: 200,
      });
      return {
        accounts: accounts.map(
          ({ verificationEvidence: _verificationEvidence, ...account }) =>
            account,
        ),
        payouts: payouts.map(
          ({
            transferEvidence: _transferEvidence,
            recipientCheckEvidence: _recipientCheckEvidence,
            ...payout
          }) => this.payoutView(payout as ShopPayout),
        ),
        events: events
          .filter((event) => event.type !== PAYOUT_EVENT.OPERATIONS_EVIDENCE)
          .map(({ actorId: _actorId, ...event }) => event),
      };
    });
  }
  async saveBank(
    userId: string,
    shopId: string,
    input: BankAccountInput,
    id?: string,
  ) {
    const data = bankAccountInputSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      await this.assertOwner(manager, userId, shopId);
      const existing = id
        ? await manager.findOneBy(ShopBankAccount, {
            id,
            shopId,
            deletedAt: IsNull(),
          })
        : null;
      if (id && !existing)
        throw new NotFoundException('Bank profile not found');
      if (data.isDefault)
        await manager.update(
          ShopBankAccount,
          { shopId, isDefault: true },
          { isDefault: false },
        );
      const bank = existing ?? manager.create(ShopBankAccount, { shopId });
      Object.assign(bank, {
        bankCode: data.bankCode,
        accountNumber: data.accountNumber,
        accountName: data.accountName,
        isDefault: data.isDefault,
        confirmedBy: userId,
        confirmedAt: now,
        verificationStatus: BANK_VERIFICATION.UNVERIFIED,
        verificationEvidence: null,
      });
      return manager.save(bank);
    });
  }
  async deleteBank(userId: string, shopId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      await this.assertOwner(manager, userId, shopId);
      const bank = await manager.findOneBy(ShopBankAccount, {
        id,
        shopId,
        deletedAt: IsNull(),
      });
      if (!bank) throw new NotFoundException('Bank profile not found');
      bank.deletedAt = now;
      bank.isDefault = false;
      await manager.save(bank);
      return { deleted: true };
    });
  }
  async reviewBank(
    actorId: string,
    id: string,
    input: { evidence: string; riskReason: string | null },
  ) {
    const data = bankReviewSchema.parse(input);
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      await this.assertAdmin(manager, actorId);
      const bank = await manager.findOneBy(ShopBankAccount, { id });
      if (!bank) throw new NotFoundException('Bank profile not found');
      bank.riskReason = data.riskReason;
      bank.verificationEvidence = data.evidence;
      bank.verificationStatus = data.riskReason
        ? BANK_VERIFICATION.UNVERIFIED
        : BANK_VERIFICATION.MANUALLY_VERIFIED;
      await manager.save(bank);
      return {
        id: bank.id,
        verificationStatus: bank.verificationStatus,
        riskReason: bank.riskReason,
      };
    });
  }
  async request(userId: string, shopId: string, input: PayoutRequestInput) {
    const data = payoutRequestSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      await this.assertOwner(manager, userId, shopId);
      const replay = await manager.findOneBy(ShopPayout, {
        shopId,
        requestId: data.requestId,
      });
      if (replay) {
        if (
          replay.amount !== data.amount ||
          replay.mode !== data.mode ||
          replay.bankAccountId !== data.bankAccountId
        )
          throw new ConflictException('Request ID already used');
        return this.payoutView(replay);
      }
      if (
        await manager.existsBy(ShopPayout, {
          shopId,
          status: In([...ACTIVE_PAYOUT_STATUSES]),
        })
      )
        throw new ConflictException('Shop already has an active payout');
      const bank = await this.assertSafe(manager, {
        shopId,
        ownerId: userId,
        bankAccountId: data.bankAccountId,
      });
      await settleShopFees(manager, shopId, data.mode, now);
      const funds = await readPayoutSources(manager, shopId, data.mode);
      const allocations = allocatePayout(funds.sources, data.amount);
      const payout = await manager.save(
        ShopPayout,
        manager.create(ShopPayout, {
          shopId,
          ownerId: userId,
          requestId: data.requestId,
          mode: data.mode,
          amount: data.amount,
          bankAccountId: bank.id,
          status: PAYOUT_STATUS.PENDING,
          recipientSnapshot: {
            bankCode: bank.bankCode,
            accountNumber: bank.accountNumber,
            accountName: bank.accountName,
          },
          createdAt: now,
          dueAt: await fulfillmentDeadline(
            manager,
            now,
            PAYOUT_POLICY.SLA_BUSINESS_DAYS,
          ),
        }),
      );
      await manager.save(
        ShopPayoutAllocation,
        allocations.map((source) =>
          manager.create(ShopPayoutAllocation, {
            ...source,
            payoutId: payout.id,
          }),
        ),
      );
      await this.event(
        manager,
        payout,
        PAYOUT_EVENT.REQUESTED,
        userId,
        'Funds reserved; manual recipient review required',
      );
      return this.payoutView(payout);
    });
  }
  private async backed(manager: EntityManager, payout: ShopPayout) {
    const funds = await readPayoutSources(
      manager,
      payout.shopId,
      payout.mode,
      payout.id,
    );
    const allocations = await manager.findBy(ShopPayoutAllocation, {
      payoutId: payout.id,
    });
    return (
      allocations.length > 0 &&
      allocations.every((allocation) =>
        funds.sources.some(
          (source) =>
            source.kind === allocation.kind &&
            source.sourceId === allocation.sourceId &&
            source.amount >= allocation.amount,
        ),
      )
    );
  }
  async start(actorId: string, id: string, evidence: string) {
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      await this.assertAdmin(manager, actorId);
      const payout = await this.find(manager, id);
      if (payout.status !== PAYOUT_STATUS.PENDING)
        throw new ConflictException('Only pending payouts can start');
      await this.assertSafe(manager, payout);
      if (!(await this.backed(manager, payout)))
        throw new ConflictException('Reserved source no longer available');
      payout.recipientCheckEvidence = evidence;
      payout.status = PAYOUT_STATUS.PROCESSING;
      payout.processedAt = now;
      await manager.save(payout);
      await this.event(
        manager,
        payout,
        PAYOUT_STATUS.PROCESSING,
        actorId,
        'Recipient manually checked; funds remain locked',
      );
      return this.payoutView(payout);
    });
  }
  async cancel(userId: string, shopId: string, id: string) {
    return this.finishPending(
      userId,
      id,
      PAYOUT_STATUS.CANCELLED,
      'Cancelled by Owner',
      shopId,
    );
  }
  async reject(actorId: string, id: string, reason: string) {
    return this.finishPending(actorId, id, PAYOUT_STATUS.REJECTED, reason);
  }
  private async finishPending(
    actorId: string,
    id: string,
    status: PayoutStatus,
    reason: string,
    shopId?: string,
  ) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      if (shopId) await this.assertOwner(manager, actorId, shopId);
      else await this.assertAdmin(manager, actorId);
      const payout = await this.find(manager, id);
      if (shopId && payout.shopId !== shopId)
        throw new NotFoundException('Payout not found');
      if (payout.status !== PAYOUT_STATUS.PENDING)
        throw new ConflictException(
          'Only pending payouts can be cancelled or rejected',
        );
      payout.status = status;
      payout.reason = reason;
      await manager.save(payout);
      await this.event(manager, payout, status, actorId, reason);
      return this.payoutView(payout);
    });
  }
  async unknown(actorId: string, id: string, reason: string) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      await this.assertAdmin(manager, actorId);
      const payout = await this.find(manager, id);
      if (
        !(
          [PAYOUT_STATUS.PROCESSING, PAYOUT_STATUS.UNKNOWN] as readonly string[]
        ).includes(payout.status)
      )
        throw new ConflictException('Transfer must have started');
      payout.status = PAYOUT_STATUS.UNKNOWN;
      payout.reason = reason;
      await manager.save(payout);
      await this.event(
        manager,
        payout,
        PAYOUT_STATUS.UNKNOWN,
        actorId,
        'Bank result unresolved; reservation remains locked: ' + reason,
      );
      return this.payoutView(payout);
    });
  }
  async fail(
    actorId: string,
    id: string,
    input: {
      reason: string;
      evidence: string;
      noDebit: true;
      noInflight: true;
    },
  ) {
    const data = payoutFailureSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      await this.assertAdmin(manager, actorId);
      const payout = await this.find(manager, id);
      if (
        !(
          [PAYOUT_STATUS.PROCESSING, PAYOUT_STATUS.UNKNOWN] as readonly string[]
        ).includes(payout.status) ||
        !canReleasePayout(payout.status, data.noDebit, data.noInflight)
      )
        throw new ConflictException('Verified failure required');
      payout.status = PAYOUT_STATUS.FAILED;
      payout.reason = data.reason;
      payout.transferEvidence = data.evidence;
      payout.completedAt = now;
      await manager.save(payout);
      await this.event(
        manager,
        payout,
        PAYOUT_STATUS.FAILED,
        actorId,
        data.reason,
      );
      return this.payoutView(payout);
    });
  }
  async succeed(actorId: string, id: string, input: PayoutSuccessInput) {
    const data = payoutSuccessSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      await this.assertAdmin(manager, actorId);
      const payout = await this.find(manager, id);
      assertExactTransfer(payout.amount, payout.recipientSnapshot, data);
      if (new Date(data.transferredAt) > now)
        throw new ConflictException('Transfer time cannot be in the future');
      if (payout.status === PAYOUT_STATUS.SUCCEEDED) {
        if (
          payout.bankReference !== data.bankReference ||
          payout.transferEvidence !== data.evidence ||
          payout.bankTransferredAt?.getTime() !==
            new Date(data.transferredAt).getTime()
        )
          throw new ConflictException('Conflicting bank result');
        return this.payoutView(payout);
      }
      if (
        !(
          [
            PAYOUT_STATUS.PROCESSING,
            PAYOUT_STATUS.UNKNOWN,
            PAYOUT_STATUS.FAILED,
          ] as readonly string[]
        ).includes(payout.status)
      )
        throw new ConflictException('Transfer must have started');
      let risk = false;
      try {
        await this.assertSafe(manager, payout);
      } catch {
        risk = true;
      }
      const backed = await this.backed(manager, payout);
      const wasFailed = payout.status === PAYOUT_STATUS.FAILED;
      payout.status = PAYOUT_STATUS.SUCCEEDED;
      payout.bankReference = data.bankReference;
      payout.bankTransferredAt = new Date(data.transferredAt);
      payout.transferEvidence = data.evidence;
      payout.completedAt = now;
      await manager.save(payout);
      await this.event(
        manager,
        payout,
        PAYOUT_STATUS.SUCCEEDED,
        actorId,
        'Exact bank transfer recorded; platform bears transfer fees',
      );
      if (risk || !backed || wasFailed)
        await this.event(
          manager,
          payout,
          PAYOUT_EVENT.RECONCILIATION_INCIDENT,
          actorId,
          'Actual transfer recorded despite subsequent risk, source correction or prior failure; investigate attributable debt',
        );
      return this.payoutView(payout);
    });
  }
  async nonreceipt(userId: string, shopId: string, id: string, reason: string) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      await this.assertOwner(manager, userId, shopId);
      const payout = await this.find(manager, id);
      if (payout.shopId !== shopId)
        throw new NotFoundException('Payout not found');
      if (payout.status !== PAYOUT_STATUS.SUCCEEDED)
        throw new ConflictException('Only completed transfers can be reported');
      await this.event(
        manager,
        payout,
        PAYOUT_EVENT.NONRECEIPT_INCIDENT,
        userId,
        reason,
      );
      return { incidentRecorded: true, additionalTransfer: false };
    });
  }
  async adminView(actorId: string) {
    return this.db.transaction(async (manager) => {
      await this.assertAdmin(manager, actorId);
      return {
        payouts: (
          await manager.find(ShopPayout, {
            order: { createdAt: 'DESC' },
            take: 100,
          })
        ).map((payout) => this.payoutView(payout)),
        events: await manager.find(ShopPayoutEvent, {
          order: { createdAt: 'DESC' },
          take: 200,
        }),
      };
    });
  }
  async operationalUpdate(
    actorId: string,
    id: string,
    reason: string,
    evidence: string,
  ) {
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      await this.assertAdmin(manager, actorId);
      const payout = await this.find(manager, id);
      if (
        !(ACTIVE_PAYOUT_STATUSES as readonly string[]).includes(
          payout.status,
        ) &&
        payout.status !== PAYOUT_STATUS.SUCCEEDED
      )
        throw new ConflictException('Payout already resolved');
      payout.operationalUpdateAt = now;
      await manager.save(payout);
      await this.event(
        manager,
        payout,
        PAYOUT_EVENT.OPERATIONS_UPDATE,
        actorId,
        reason,
      );
      await this.event(
        manager,
        payout,
        PAYOUT_EVENT.OPERATIONS_EVIDENCE,
        actorId,
        evidence,
      );
      return this.payoutView(payout);
    });
  }
  async run() {
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const payouts = await manager.findBy(ShopPayout, {
        status: In([...ACTIVE_PAYOUT_STATUSES]),
      });
      for (const payout of payouts) {
        payout.dueAt ??= await fulfillmentDeadline(
          manager,
          payout.createdAt,
          PAYOUT_POLICY.SLA_BUSINESS_DAYS,
        );
        if (payout.dueAt && now > payout.dueAt && !payout.overdueAt) {
          payout.overdueAt = now;
          await this.event(
            manager,
            payout,
            PAYOUT_EVENT.OVERDUE_OWNER_NOTICE,
            null,
            'Payout overdue; operations follow-up required, funds remain reserved',
          );
          await this.event(
            manager,
            payout,
            PAYOUT_EVENT.OVERDUE_OPERATIONS_NOTICE,
            null,
            'Provide a resolution update within one approved business day',
          );
        }
        if (payout.overdueAt)
          payout.followUpDueAt ??= await fulfillmentDeadline(
            manager,
            payout.dueAt!,
            PAYOUT_POLICY.FOLLOWUP_BUSINESS_DAYS,
          );
        const hasPostOverdueUpdate =
          payout.operationalUpdateAt &&
          payout.overdueAt &&
          payout.operationalUpdateAt >= payout.overdueAt;
        if (
          payout.followUpDueAt &&
          now > payout.followUpDueAt &&
          !hasPostOverdueUpdate &&
          !payout.followUpOverdueAt
        ) {
          payout.followUpOverdueAt = now;
          await this.event(
            manager,
            payout,
            PAYOUT_EVENT.FOLLOWUP_OVERDUE,
            null,
            'Operational resolution update overdue; reconciliation required',
          );
        }
        await manager.save(payout);
      }
    });
  }
}
