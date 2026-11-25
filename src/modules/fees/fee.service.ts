import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { DisputeReturn } from '@/modules/dispute/returns/entities/dispute-return.entity';
import { ReturnShippingCharge } from '@/modules/dispute/returns/entities/return-shipping-charge.entity';
import { ORDER_STATUS } from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities';
import { OrderAccess } from '@/modules/order/order.access';
import { SHIPMENT_STATE } from '@/modules/shipment/constants/shipment.constant';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { fulfillmentDeadline } from '@/modules/shipment/utils/fulfillment-calendar';
import { ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';
import { verifiedWalletFunds } from '@/modules/wallet/verified-wallet-funds';

import {
  FEE_ACTION,
  FEE_KIND,
  FEE_PARTY,
  FEE_POLICY,
  FEE_STATUS,
} from './constants/fee.constant';
import { verifyFeeDisclosure } from './disclosure/fee-disclosure';
import {
  FeeAssessment,
  FeeCollection,
  FeeDecision,
  FeeNotice,
  FeeRefund,
} from './entities';
import { feeOutstanding, queueFeeCorrections } from './fee-accounting';
import {
  buyerFeeDisposition,
  feePaymentWindow,
  withinActualFeeInvoice,
} from './policies/fee.policy';
import {
  feeAssessmentSchema,
  feeCorrectionSchema,
  feeObjectionSchema,
} from './schemas/fee.schema';
import type {
  FeeAssessmentInput,
  FeeCorrectionInput,
  FeeObjectionInput,
} from './schemas/fee.schema';

@Injectable()
export class FeeService {
  private readonly access = new OrderAccess();
  constructor(private readonly db: DataSource) {}
  private async lock(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }
  private async admin(manager: EntityManager, id: string) {
    const user = await manager.findOneBy(User, {
      id,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });
    if (!user) throw new ForbiddenException('Active Admin required');
  }
  private async party(
    manager: EntityManager,
    userId: string,
    fee: FeeAssessment,
  ) {
    const user = await manager.findOneBy(User, {
      id: userId,
      status: UserStatus.ACTIVE,
    });
    if (!user) throw new ForbiddenException('Active account required');
    if (user.role === UserRole.ADMIN) return;
    if (fee.party === FEE_PARTY.BUYER && userId === fee.buyerId) return;
    if (fee.party === FEE_PARTY.SHOP)
      return this.access.assertManage(manager, userId, fee.shopId, true);
    throw new ForbiddenException('Fee party access required');
  }
  async assess(adminId: string, input: FeeAssessmentInput) {
    const data = feeAssessmentSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      await this.admin(manager, adminId);
      const fee = await this.assessInTransaction(manager, adminId, data, now);
      return this.project(manager, fee);
    });
  }
  async assessInTransaction(
    manager: EntityManager,
    actorId: string,
    data: FeeAssessmentInput,
    now: Date,
  ) {
    const order = await manager.findOneByOrFail(Order, { id: data.orderId });
    const shipment = await manager.findOneBy(Shipment, { orderId: order.id });
    if (!withinActualFeeInvoice(data.amount, data.actualInvoiceAmount))
      throw new ConflictException(
        'Verified actual invoice amount is required and caps the fee',
      );
    if (
      [FEE_KIND.RETURN_SHIPPING, FEE_KIND.REFUSAL_EXTRA].some(
        (kind) => kind === data.kind,
      )
    )
      throw new ConflictException(
        'Return fees require an immutable verified return shipping charge',
      );
    if (data.kind === FEE_KIND.SELLER_PACKAGE_ERROR) {
      const increase =
        (data.actualInvoiceAmount ?? 0) - (data.originallyQuotedAmount ?? 0);
      if (
        data.party !== FEE_PARTY.SHOP ||
        data.originallyQuotedAmount === undefined ||
        shipment?.carrierFee == null ||
        data.originallyQuotedAmount !== shipment.carrierFee ||
        data.amount > increase
      )
        throw new ConflictException(
          'Only the verified actual package invoice increase is chargeable',
        );
    }
    const terminal =
      data.kind === FEE_KIND.CANCELLATION
        ? order.status === ORDER_STATUS.CANCELLED &&
          shipment?.state === SHIPMENT_STATE.CANCELLED
        : data.kind === FEE_KIND.SELLER_PACKAGE_ERROR
          ? !!shipment?.pickedObservedAt
          : !!order.carrierReturnedAt || order.status === ORDER_STATUS.RETURNS;
    if (
      !terminal ||
      shipment?.orderCode !== data.waybillId ||
      data.sourceId !== shipment.id
    )
      throw new ConflictException(
        'Verified terminal source and matching actual waybill required',
      );
    if (!(await verifyFeeDisclosure(manager, order, data.party, data.kind)))
      throw new ConflictException('Prior explicit fee disclosure missing');
    return this.persistAssessment(manager, actorId, data, order, now);
  }
  private async persistAssessment(
    manager: EntityManager,
    actorId: string,
    data: FeeAssessmentInput,
    order: Order,
    now: Date,
  ) {
    const existing = await manager.findOneBy(FeeAssessment, {
      orderId: order.id,
      mode: data.mode,
      kind: data.kind,
      sourceId: data.sourceId,
      invoiceLine: data.invoiceLine,
    });
    if (existing) {
      if (
        existing.amount !== data.amount ||
        existing.invoiceReference !== data.invoiceReference ||
        existing.party !== data.party ||
        existing.invoiceLine !== data.invoiceLine
      )
        throw new ConflictException('Invoice replay differs');
      return existing;
    }
    const fee = manager.create(FeeAssessment, {
      ...data,
      shopId: order.shopId,
      buyerId: order.buyerId,
      payableAmount: data.amount,
      status: FEE_STATUS.ACTIVE,
      disclosureVerifiedAt: now,
      notifiedAt: null,
      dueAt: null,
      objectionAt: null,
      reviewDueAt: null,
      reviewOverdueAt: null,
      objectionUsed: false,
      createdAt: now,
    });
    if (data.party === FEE_PARTY.BUYER) {
      const funds = await verifiedWalletFunds(
        manager,
        order.buyerId,
        data.mode,
      );
      fee.status = buyerFeeDisposition(
        data.amount,
        funds.spendable,
        FEE_POLICY.PAYOS_MINIMUM,
      );
      if (fee.status === FEE_STATUS.ABSORBED) fee.payableAmount = 0;
    }
    await manager.save(FeeAssessment, fee);
    if (fee.party === FEE_PARTY.SHOP && fee.status === FEE_STATUS.ACTIVE)
      await this.notify(manager, fee, now, false);
    await this.activate(manager, fee, now);
    await this.history(
      manager,
      fee,
      actorId,
      FEE_ACTION.ASSESSED,
      data.reason,
      data.evidence,
      now,
    );
    return manager.findOneByOrFail(FeeAssessment, { id: fee.id });
  }
  async assessVerifiedReturnCharge(
    manager: EntityManager,
    charge: ReturnShippingCharge,
    now: Date,
  ): Promise<FeeAssessment | null> {
    const order = await manager.findOneByOrFail(Order, { id: charge.orderId });
    const kind =
      charge.kind === FEE_KIND.REFUSAL_EXTRA
        ? FEE_KIND.REFUSAL_EXTRA
        : FEE_KIND.RETURN_SHIPPING;
    if (!(await verifyFeeDisclosure(manager, order, FEE_PARTY.SHOP, kind)))
      return null;
    const returned = await manager.findOneBy(DisputeReturn, {
      id: charge.returnId,
    });
    if (
      !charge.waybillCode ||
      !returned ||
      returned.orderId !== order.id ||
      returned.shopId !== charge.shopId ||
      order.shopId !== charge.shopId ||
      returned.mode !== charge.mode
    )
      return null;
    return this.persistAssessment(
      manager,
      charge.actorId,
      {
        orderId: order.id,
        party: FEE_PARTY.SHOP,
        mode: charge.mode,
        kind,
        sourceId: charge.id,
        waybillId: charge.waybillCode,
        invoiceReference: charge.invoiceReference,
        invoiceLine: charge.kind,
        amount: charge.amount,
        actualInvoiceAmount: charge.amount,
        reason: charge.reason,
        evidence: charge.evidence,
      },
      order,
      now,
    );
  }
  async activate(manager: EntityManager, fee: FeeAssessment, now: Date) {
    if (fee.status !== FEE_STATUS.ACTIVE || fee.dueAt) return;
    if (fee.party === FEE_PARTY.SHOP) {
      const rows = await manager.findBy(FeeAssessment, {
        shopId: fee.shopId,
        mode: fee.mode,
        party: FEE_PARTY.SHOP,
        status: FEE_STATUS.ACTIVE,
      });
      let total = 0;
      for (const row of rows) total += await feeOutstanding(manager, row.id);
      if (total < FEE_POLICY.PAYOS_MINIMUM) return;
      for (const row of rows.filter((row) => !row.dueAt))
        await this.notify(manager, row, now);
      const refreshed = await manager.findOneByOrFail(FeeAssessment, {
        id: fee.id,
      });
      fee.dueAt = refreshed.dueAt;
      fee.notifiedAt = refreshed.notifiedAt;
    } else await this.notify(manager, fee, now);
  }
  private async notify(
    manager: EntityManager,
    fee: FeeAssessment,
    now: Date,
    payable = true,
    reason = fee.reason,
  ) {
    const owner =
      fee.party === FEE_PARTY.SHOP
        ? await manager.findOneByOrFail(ShopMember, {
            shopId: fee.shopId,
            memberRole: ShopMemberRole.OWNER,
          })
        : null;
    fee.notifiedAt = now;
    if (payable) fee.dueAt = feePaymentWindow(fee.party, now);
    await manager.save(FeeAssessment, fee);
    await manager.save(
      FeeNotice,
      manager.create(FeeNotice, {
        feeId: fee.id,
        recipientId: owner?.userId ?? fee.buyerId,
        action: FEE_ACTION.PAYMENT_AVAILABLE,
        snapshot: {
          payableAmount: fee.payableAmount,
          reason,
          dueAt: fee.dueAt?.toISOString() ?? null,
        },
        createdAt: now,
      }),
    );
  }
  private async history(
    manager: EntityManager,
    fee: FeeAssessment,
    actorId: string,
    action: string,
    reason: string,
    evidence: string,
    now: Date,
  ) {
    await manager.save(
      FeeDecision,
      manager.create(FeeDecision, {
        feeId: fee.id,
        actorId,
        action,
        payableAmount: fee.payableAmount,
        reason,
        evidence,
        createdAt: now,
      }),
    );
  }
  async list(userId: string, shopId?: string) {
    return this.db.transaction(async (manager) => {
      const user = await manager.findOneBy(User, {
        id: userId,
        status: UserStatus.ACTIVE,
      });
      if (!user) throw new ForbiddenException('Active account required');
      if (shopId) await this.access.assertManage(manager, userId, shopId, true);
      const rows = await manager.find(FeeAssessment, {
        where: shopId
          ? { shopId, party: FEE_PARTY.SHOP }
          : { buyerId: userId, party: FEE_PARTY.BUYER },
        order: { createdAt: 'DESC', id: 'DESC' },
        take: 100,
      });
      return Promise.all(rows.map((fee) => this.project(manager, fee)));
    });
  }
  async historyFor(userId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const fee = await manager.findOneByOrFail(FeeAssessment, { id });
      await this.party(manager, userId, fee);
      return manager.find(FeeDecision, {
        where: { feeId: id },
        order: { createdAt: 'ASC', id: 'ASC' },
        take: 100,
      });
    });
  }
  async adminQueue(userId: string, offset: number) {
    return this.db.transaction(async (manager) => {
      await this.admin(manager, userId);
      const rows = await manager
        .createQueryBuilder(FeeAssessment, 'fee')
        .orderBy('CASE WHEN fee.status = :review THEN 0 ELSE 1 END', 'ASC')
        .setParameter('review', FEE_STATUS.REVIEW)
        .addOrderBy('fee.createdAt', 'ASC')
        .addOrderBy('fee.id', 'ASC')
        .skip(offset)
        .take(100)
        .getMany();
      return Promise.all(
        rows.map(async (fee) => ({
          fee,
          outstanding: await feeOutstanding(manager, fee.id),
          collections: await manager.findBy(FeeCollection, { feeId: fee.id }),
          refunds: await manager.findBy(FeeRefund, { feeId: fee.id }),
          notices: await manager.findBy(FeeNotice, { feeId: fee.id }),
          history: await manager.find(FeeDecision, {
            where: { feeId: fee.id },
            order: { createdAt: 'ASC', id: 'ASC' },
          }),
        })),
      );
    });
  }
  async get(userId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const fee = await manager.findOneByOrFail(FeeAssessment, { id });
      await this.party(manager, userId, fee);
      return this.project(manager, fee);
    });
  }
  async object(userId: string, id: string, input: FeeObjectionInput) {
    const data = feeObjectionSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const fee = await manager.findOneByOrFail(FeeAssessment, { id });
      await this.party(manager, userId, fee);
      if (
        fee.status !== FEE_STATUS.ACTIVE ||
        fee.objectionUsed ||
        !fee.notifiedAt ||
        (fee.dueAt !== null && now > fee.dueAt)
      )
        throw new ConflictException('One timely grounded objection is allowed');
      fee.status = FEE_STATUS.REVIEW;
      fee.objectionUsed = true;
      fee.objectionAt = now;
      fee.reviewDueAt = await fulfillmentDeadline(manager, now, 2);
      await manager.save(FeeAssessment, fee);
      await this.history(
        manager,
        fee,
        userId,
        FEE_ACTION.OBJECTION,
        data.reason,
        data.evidence,
        now,
      );
      return this.project(manager, fee);
    });
  }
  async correct(adminId: string, id: string, input: FeeCorrectionInput) {
    const data = feeCorrectionSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      await this.admin(manager, adminId);
      const fee = await manager.findOneByOrFail(FeeAssessment, { id });
      await queueFeeCorrections(manager, fee, data.payableAmount, now);
      await this.absorbUnpayableBuyerRemainder(manager, fee, now);
      if (fee.status === FEE_STATUS.REVIEW && data.payableAmount > 0) {
        fee.status = FEE_STATUS.ACTIVE;
        fee.dueAt = null;
        if (fee.party === FEE_PARTY.SHOP) {
          await this.notify(manager, fee, now, false, data.reason);
          await this.activate(manager, fee, now);
        } else await this.notify(manager, fee, now, true, data.reason);
      }
      await manager.save(FeeAssessment, fee);
      await this.history(
        manager,
        fee,
        adminId,
        FEE_ACTION.CORRECTED_OR_UPHELD,
        data.reason,
        data.evidence,
        now,
      );
      return this.project(
        manager,
        await manager.findOneByOrFail(FeeAssessment, { id: fee.id }),
      );
    });
  }
  private async absorbUnpayableBuyerRemainder(
    manager: EntityManager,
    fee: FeeAssessment,
    now: Date,
  ) {
    if (fee.party !== FEE_PARTY.BUYER) return;
    const remaining = await feeOutstanding(manager, fee.id);
    if (remaining <= 0 || remaining >= FEE_POLICY.PAYOS_MINIMUM) return;
    const funds = await verifiedWalletFunds(manager, fee.buyerId, fee.mode);
    if (funds.spendable >= remaining) return;
    await queueFeeCorrections(manager, fee, fee.payableAmount - remaining, now);
    fee.status = FEE_STATUS.ABSORBED;
    fee.dueAt = null;
    await this.notify(
      manager,
      fee,
      now,
      false,
      'Platform absorbs the corrected small fee remainder because neither supported payment method is available',
    );
  }

  private async project(manager: EntityManager, fee: FeeAssessment) {
    const collections = await manager.find(FeeCollection, {
      where: { feeId: fee.id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const refunds = await manager.find(FeeRefund, {
      where: { feeId: fee.id },
      order: { requestedAt: 'ASC', id: 'ASC' },
    });
    const notices = await manager.find(FeeNotice, {
      where: { feeId: fee.id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const decision = await manager.findOne(FeeDecision, {
      where: { feeId: fee.id },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return {
      id: fee.id,
      orderId: fee.orderId,
      party: fee.party,
      mode: fee.mode,
      kind: fee.kind,
      amount: fee.amount,
      payableAmount: fee.payableAmount,
      status: fee.status,
      outstanding: await feeOutstanding(manager, fee.id),
      reason: decision?.reason ?? fee.reason,
      notices: notices.map((notice) => ({
        id: notice.id,
        action: notice.action,
        amount: Number(notice.snapshot.payableAmount),
        reason:
          typeof notice.snapshot.reason === 'string'
            ? notice.snapshot.reason
            : fee.reason,
        dueAt: notice.snapshot.dueAt as string | null,
        createdAt: notice.createdAt,
      })),
      notifiedAt: fee.notifiedAt,
      dueAt: fee.dueAt,
      objectionUsed: fee.objectionUsed,
      objectionAt: fee.objectionAt,
      reviewDueAt: fee.reviewDueAt,
      reviewOverdueAt: fee.reviewOverdueAt,
      collections: collections.map(({ id, method, amount, createdAt }) => ({
        id,
        method,
        amount,
        createdAt,
      })),
      refunds: refunds.map(
        ({ id, method, amount, state, requestedAt, completedAt }) => ({
          id,
          method,
          amount,
          state,
          requestedAt,
          completedAt,
        }),
      ),
    };
  }
  async tick() {
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      for (const fee of await manager.findBy(FeeAssessment, {
        status: FEE_STATUS.REVIEW,
      })) {
        if (!fee.reviewDueAt && fee.objectionAt)
          fee.reviewDueAt = await fulfillmentDeadline(
            manager,
            fee.objectionAt,
            2,
          );
        if (fee.reviewDueAt && now > fee.reviewDueAt && !fee.reviewOverdueAt)
          fee.reviewOverdueAt = now;
        await manager.save(FeeAssessment, fee);
      }
    });
  }
}
