import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { DataSource, EntityManager, In, IsNull } from 'typeorm';

import { businessDeadline } from '@/modules/shipment/utils/business-calendar';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole, ShopStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import {
  ACTIVE_PAYOUT_STATUSES,
  PAYOUT_POLICY,
  PAYOUT_STATUS,
} from './constants/payout.constant';
import { ShopBankAccount, ShopPayout, ShopPayoutAllocation } from './entities';
import { readPayoutSources } from './payout-sources';
import {
  type BankAccountInput,
  bankAccountInputSchema,
  type PayoutFailureInput,
  payoutFailureSchema,
  type PayoutRequestInput,
  payoutRequestSchema,
  type PayoutSource,
  type PayoutStatus,
  type PayoutSuccessInput,
  payoutSuccessSchema,
  type RecipientSnapshot,
} from './schemas/payout.schema';

export function allocatePayout(
  sources: PayoutSource[],
  amount: number,
): PayoutSource[] {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new ConflictException('Invalid payout amount');
  let remaining = amount;
  const allocations: PayoutSource[] = [];
  for (const source of sources) {
    if (remaining === 0) break;
    const take = Math.min(source.amount, remaining);
    if (take > 0) allocations.push({ ...source, amount: take });
    remaining -= take;
  }
  if (remaining !== 0)
    throw new ConflictException('Insufficient available source funds');
  return allocations;
}

export function assertExactTransfer(
  amount: number,
  recipient: RecipientSnapshot,
  result: RecipientSnapshot & { amount: number },
): void {
  if (
    amount !== result.amount ||
    recipient.bankCode !== result.bankCode ||
    recipient.accountNumber !== result.accountNumber ||
    recipient.accountName !== result.accountName
  )
    throw new ConflictException('Bank evidence does not match payout snapshot');
}

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
    const [member, user] = await Promise.all([
      manager.findOneBy(ShopMember, {
        shopId,
        userId,
        memberRole: ShopMemberRole.OWNER,
      }),
      manager.findOneBy(User, {
        id: userId,
        status: UserStatus.ACTIVE,
      }),
    ]);
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

  private findForUpdate(manager: EntityManager, id: string, shopId?: string) {
    return manager.findOneOrFail(ShopPayout, {
      where: shopId ? { id, shopId } : { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  async ownerView(userId: string, shopId: string) {
    const manager = this.db.manager;
    await this.assertOwner(manager, userId, shopId);
    const [accounts, payouts] = await Promise.all([
      manager.find(ShopBankAccount, {
        where: { shopId, deletedAt: IsNull() },
        order: { createdAt: 'DESC' },
      }),
      manager.find(ShopPayout, {
        where: { shopId },
        order: { createdAt: 'DESC' },
        take: 100,
      }),
    ]);
    return {
      accounts,
      payouts: payouts.map(
        ({ transferEvidence: _transferEvidence, ...payout }) => payout,
      ),
    };
  }

  async adminView(actorId: string) {
    const manager = this.db.manager;
    await this.assertAdmin(manager, actorId);
    const payouts = await manager.find(ShopPayout, {
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return { payouts };
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
        ? await manager.findOneByOrFail(ShopBankAccount, {
            id,
            shopId,
            deletedAt: IsNull(),
          })
        : null;
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
      const bank = await manager.findOneOrFail(ShopBankAccount, {
        where: { id, shopId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
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
    const [funds, allocations] = await Promise.all([
      readPayoutSources(manager, payout.shopId, payout.mode, payout.id),
      manager.findBy(ShopPayoutAllocation, { payoutId: payout.id }),
    ]);
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
      const payout = await this.findForUpdate(manager, id, shopId);
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
}
