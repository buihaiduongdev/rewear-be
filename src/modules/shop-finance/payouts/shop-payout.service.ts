import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, EntityManager, In, IsNull } from 'typeorm';

import { businessDeadline } from '@/modules/shipment/utils/business-calendar';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole, ShopStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { readPayoutSources } from '../payout-sources';
import {
  ACTIVE_PAYOUT_STATUSES,
  PAYOUT_POLICY,
  PAYOUT_STATUS,
} from './constants/payout.constant';
import { ShopBankAccount, ShopPayout, ShopPayoutAllocation } from './entities';
import { allocatePayout, assertExactTransfer } from './payout-policy';
import {
  type BankAccountInput,
  bankAccountInputSchema,
  type PayoutFailureInput,
  payoutFailureSchema,
  type PayoutRequestInput,
  payoutRequestSchema,
  type PayoutStatus,
  type PayoutSuccessInput,
  payoutSuccessSchema,
} from './schemas/payout.schema';

@Injectable()
export class ShopPayoutService {
  constructor(private readonly db: DataSource) {}

  private async now(manager: EntityManager): Promise<Date> {
    const [row] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(row.now);
  }

  private async assertAdmin(manager: EntityManager, actorId: string) {
    const admin = await manager.findOneBy(User, {
      id: actorId,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });
    if (!admin) throw new ForbiddenException('Active Admin required');
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

  private async assertActiveRecipient(
    manager: EntityManager,
    payout: Pick<ShopPayout, 'shopId' | 'bankAccountId' | 'ownerId'>,
  ) {
    const shop = await manager.findOne(Shop, {
      where: { id: payout.shopId, status: ShopStatus.ACTIVE },
      lock: { mode: 'pessimistic_write' },
    });
    const bank = await manager.findOneBy(ShopBankAccount, {
      id: payout.bankAccountId,
      shopId: payout.shopId,
      deletedAt: IsNull(),
    });
    await this.assertOwner(manager, payout.ownerId, payout.shopId);
    if (!shop || !bank)
      throw new ConflictException('Active Shop and bank account required');
    return bank;
  }

  private async findForUpdate(manager: EntityManager, id: string) {
    const payout = await manager.findOne(ShopPayout, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
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
      return {
        accounts,
        payouts: payouts.map(
          ({ transferEvidence: _transferEvidence, ...payout }) => payout,
        ),
      };
    });
  }

  async adminView(actorId: string) {
    return this.db.transaction(async (manager) => {
      await this.assertAdmin(manager, actorId);
      const payouts = await manager.find(ShopPayout, {
        order: { createdAt: 'DESC' },
        take: 100,
      });
      return { payouts };
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
      const now = await this.now(manager);
      await this.assertOwner(manager, userId, shopId);
      await manager.findOne(Shop, {
        where: { id: shopId },
        lock: { mode: 'pessimistic_write' },
      });
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
      });
      return manager.save(bank);
    });
  }

  async deleteBank(userId: string, shopId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      await this.assertOwner(manager, userId, shopId);
      const bank = await manager.findOne(ShopBankAccount, {
        where: { id, shopId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!bank) throw new NotFoundException('Bank profile not found');
      bank.deletedAt = now;
      bank.isDefault = false;
      await manager.save(bank);
      return { deleted: true };
    });
  }

  async request(userId: string, shopId: string, input: PayoutRequestInput) {
    const data = payoutRequestSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      await this.assertOwner(manager, userId, shopId);
      const bank = await this.assertActiveRecipient(manager, {
        shopId,
        ownerId: userId,
        bankAccountId: data.bankAccountId,
      });
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
        return replay;
      }
      if (
        await manager.existsBy(ShopPayout, {
          shopId,
          status: In([...ACTIVE_PAYOUT_STATUSES]),
        })
      )
        throw new ConflictException('Shop already has an active payout');
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
          dueAt: businessDeadline(now, PAYOUT_POLICY.SLA_BUSINESS_DAYS),
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
      return payout;
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

  async start(actorId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      await this.assertAdmin(manager, actorId);
      const payout = await this.findForUpdate(manager, id);
      if (payout.status !== PAYOUT_STATUS.PENDING)
        throw new ConflictException('Only pending payouts can start');
      await this.assertActiveRecipient(manager, payout);
      if (!(await this.backed(manager, payout)))
        throw new ConflictException('Reserved source no longer available');
      payout.status = PAYOUT_STATUS.PROCESSING;
      payout.processedAt = now;
      return manager.save(payout);
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
      if (shopId) await this.assertOwner(manager, actorId, shopId);
      else await this.assertAdmin(manager, actorId);
      const payout = await this.findForUpdate(manager, id);
      if (shopId && payout.shopId !== shopId)
        throw new NotFoundException('Payout not found');
      if (payout.status !== PAYOUT_STATUS.PENDING)
        throw new ConflictException(
          'Only pending payouts can be cancelled or rejected',
        );
      payout.status = status;
      payout.reason = reason;
      return manager.save(payout);
    });
  }

  async fail(actorId: string, id: string, input: PayoutFailureInput) {
    const data = payoutFailureSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      await this.assertAdmin(manager, actorId);
      const payout = await this.findForUpdate(manager, id);
      if (payout.status !== PAYOUT_STATUS.PROCESSING)
        throw new ConflictException('Only processing payouts can fail');
      payout.status = PAYOUT_STATUS.FAILED;
      payout.reason = data.reason;
      payout.transferEvidence = data.evidence;
      payout.completedAt = now;
      return manager.save(payout);
    });
  }

  async succeed(actorId: string, id: string, input: PayoutSuccessInput) {
    const data = payoutSuccessSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      await this.assertAdmin(manager, actorId);
      const payout = await this.findForUpdate(manager, id);
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
        return payout;
      }
      if (
        !(
          [PAYOUT_STATUS.PROCESSING, PAYOUT_STATUS.FAILED] as readonly string[]
        ).includes(payout.status)
      )
        throw new ConflictException('Transfer must have started');
      payout.status = PAYOUT_STATUS.SUCCEEDED;
      payout.bankReference = data.bankReference;
      payout.bankTransferredAt = new Date(data.transferredAt);
      payout.transferEvidence = data.evidence;
      payout.completedAt = now;
      return manager.save(payout);
    });
  }

  async run() {
    return this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      const missingDue = await manager.find(ShopPayout, {
        where: { status: In([...ACTIVE_PAYOUT_STATUSES]), dueAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      for (const payout of missingDue) {
        payout.dueAt = businessDeadline(
          payout.createdAt,
          PAYOUT_POLICY.SLA_BUSINESS_DAYS,
        );
        await manager.save(payout);
      }
      await manager
        .createQueryBuilder()
        .update(ShopPayout)
        .set({ overdueAt: now })
        .where(
          'status IN (:...statuses) AND "dueAt" < :now AND "overdueAt" IS NULL',
          { statuses: [...ACTIVE_PAYOUT_STATUSES], now },
        )
        .execute();
    });
  }
}
