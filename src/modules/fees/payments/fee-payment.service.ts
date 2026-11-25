import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { DataSource, EntityManager, In, LessThanOrEqual } from 'typeorm';

import { MAX_VND_AMOUNT } from '@/common/constants/money.constant';
import {
  generatePayosOrderCode,
  PayosClient,
  type PayosPaymentResult,
  type PayosWebhookResult,
} from '@/infrastructure/payment/payos.client';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import {
  PAYMENT_MAX_AMOUNT,
  PAYMENT_MIN_AMOUNT,
  PAYMENT_PROVIDER_OUTCOME,
  PAYOS_STATUS,
} from '@/modules/payment/constants/payment.constant';
import { PaymentAttempt, PaymentRefund } from '@/modules/payment/entities';
import { PAYOS_CLIENT } from '@/modules/payment/payment.config';
import { providerOutcome } from '@/modules/payment/policies/payment.policy';
import { ShopMember } from '@/modules/shop/entities/shop-member.entity';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';
import { ExcessCapture } from '@/modules/wallet/excess/entities';

import {
  FEE_COLLECTION_METHOD,
  FEE_PARTY,
  FEE_STATUS,
} from '../constants/fee.constant';
import { FeeAssessment, FeeRefund } from '../entities';
import { feeOutstanding, recordFeeCollection } from '../fee-accounting';
import {
  FEE_PAYMENT_EVENT,
  FEE_PAYMENT_INFO_PREFIX,
  FEE_PAYMENT_LEASE_MS,
  FEE_PAYMENT_POLICY,
  FEE_PAYMENT_STATE,
  FEE_PROVIDER_REFUND_STATE,
} from './constants/fee-payment.constant';
import { FeePayment, FeePaymentCapture, FeeProviderRefund } from './entities';
import {
  allocateFeeCapture,
  feeRefundPublicView,
  hasOverlappingFeeAttempt,
} from './fee-payment.policy';
import {
  type CreateFeePaymentInput,
  createFeePaymentSchema,
  type FeeTarget,
} from './schemas/fee-payment.schema';

@Injectable()
export class FeePaymentService {
  constructor(
    private readonly db: DataSource,
    @Inject(PAYOS_CLIENT) private readonly client: PayosClient | null,
  ) {}

  private gateway() {
    if (!this.client)
      throw new ServiceUnavailableException('PayOS gateway is disabled');
    return this.client;
  }

  private async now(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }

  private async authorize(
    manager: EntityManager,
    userId: string,
    fee: FeeAssessment,
    adminView = false,
  ) {
    const user = await manager.findOneBy(User, {
      id: userId,
      status: UserStatus.ACTIVE,
    });
    if (!user) throw new UnauthorizedException();
    if (adminView && user.role === UserRole.ADMIN) return;
    if (fee.party === FEE_PARTY.BUYER && fee.buyerId === userId) return;
    if (
      fee.party === FEE_PARTY.SHOP &&
      (await manager.existsBy(ShopMember, {
        userId,
        shopId: fee.shopId,
        memberRole: ShopMemberRole.OWNER,
      }))
    )
      return;
    throw new NotFoundException('Fee not found');
  }

  async create(userId: string, input: CreateFeePaymentInput) {
    input = createFeePaymentSchema.parse(input);
    const gateway = this.gateway();
    const prepared = await this.db.transaction((manager) =>
      this.prepare(manager, userId, input),
    );
    if (prepared.send) {
      try {
        const result = await gateway.createPaymentLink({
          orderCode: Number(prepared.payment.providerOrderCode),
          amount: prepared.payment.amount,
          description:
            FEE_PAYMENT_INFO_PREFIX +
            prepared.payment.id.slice(0, 8).toUpperCase(),
          expiredAt: Math.floor(
            prepared.payment.targetDeadline.getTime() / 1000,
          ),
        });
        await this.db.transaction(async (manager) => {
          const payment = await manager.findOneOrFail(FeePayment, {
            where: { id: prepared.payment.id },
            lock: { mode: 'pessimistic_write' },
          });
          if (payment.state === FEE_PAYMENT_STATE.SUCCEEDED) return;
          const outcome = providerOutcome(result.status);
          payment.state =
            result.status === PAYOS_STATUS.PENDING ||
            outcome === PAYMENT_PROVIDER_OUTCOME.PAID
              ? FEE_PAYMENT_STATE.PENDING
              : outcome === PAYMENT_PROVIDER_OUTCOME.FAILED
                ? FEE_PAYMENT_STATE.FAILED
                : FEE_PAYMENT_STATE.UNKNOWN;
          payment.payUrl =
            payment.state === FEE_PAYMENT_STATE.PENDING
              ? (result.checkoutUrl ?? null)
              : null;
          await manager.save(payment);
        });
      } catch {
        await this.db
          .getRepository(FeePayment)
          .update(
            { id: prepared.payment.id, state: FEE_PAYMENT_STATE.CREATING },
            { state: FEE_PAYMENT_STATE.UNKNOWN },
          );
      }
    }
    return this.view(userId, prepared.payment.id);
  }

  private async prepare(
    manager: EntityManager,
    userId: string,
    input: CreateFeePaymentInput,
  ) {
    const now = await this.now(manager);
    const feeIds = [...new Set(input.feeIds)].sort();
    const fingerprint = JSON.stringify({
      feeIds,
      amount: input.amount,
      mode: input.mode,
    });
    const prior = await manager.findOneBy(FeePayment, {
      userId,
      requestId: input.requestId,
    });
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new ConflictException(
          'Request id reused with different fee targets',
        );
      for (const target of prior.targets)
        await this.authorize(
          manager,
          userId,
          await manager.findOneByOrFail(FeeAssessment, { id: target.feeId }),
        );
      return { payment: prior, send: false };
    }
    const pending = await manager.findBy(FeePayment, {
      state: In([
        FEE_PAYMENT_STATE.CREATING,
        FEE_PAYMENT_STATE.PENDING,
        FEE_PAYMENT_STATE.UNKNOWN,
      ]),
    });
    if (hasOverlappingFeeAttempt(pending, feeIds))
      throw new ConflictException(
        'Fee already has an unresolved payment attempt',
      );
    const fees = await manager.findBy(FeeAssessment, { id: In(feeIds) });
    if (fees.length !== feeIds.length)
      throw new NotFoundException('Fee not found');
    const targets: FeeTarget[] = [];
    for (const fee of fees) {
      await this.authorize(manager, userId, fee);
      if (
        fee.mode !== RECONCILIATION_MODE.SIMULATION ||
        fee.status !== FEE_STATUS.ACTIVE ||
        !fee.notifiedAt ||
        !fee.dueAt
      )
        throw new ConflictException('Fee is not payable through PayOS');
      if (
        fees.length > 1 &&
        (fee.party !== FEE_PARTY.SHOP || fee.shopId !== fees[0].shopId)
      )
        throw new ConflictException('Only same Shop fees may be grouped');
      const amount = await feeOutstanding(manager, fee.id);
      if (amount <= 0) throw new ConflictException('Fee is already collected');
      targets.push({
        feeId: fee.id,
        amount,
        mode: RECONCILIATION_MODE.SIMULATION,
        party: fee.party,
        buyerId: fee.buyerId,
        shopId: fee.shopId,
        orderId: fee.orderId,
        payableAmount: fee.payableAmount,
      });
    }
    if (
      targets.reduce((sum, target) => sum + target.amount, 0) !== input.amount
    )
      throw new ConflictException('Fee amount changed');
    const payment = manager.create(FeePayment, {
      userId,
      requestId: input.requestId,
      providerOrderCode: String(generatePayosOrderCode()),
      fingerprint,
      amount: input.amount,
      targets,
      state: FEE_PAYMENT_STATE.CREATING,
      payUrl: null,
      paidAt: null,
      nextQueryAt: new Date(now.getTime() + FEE_PAYMENT_LEASE_MS),
      targetDeadline: new Date(
        now.getTime() + FEE_PAYMENT_POLICY.TARGET_WINDOW_MS,
      ),
    });
    await manager.save(payment);
    return { payment, send: true };
  }

  async view(userId: string, id: string) {
    const payment = await this.db
      .getRepository(FeePayment)
      .findOneByOrFail({ id });
    for (const target of payment.targets)
      await this.authorize(
        this.db.manager,
        userId,
        await this.db
          .getRepository(FeeAssessment)
          .findOneByOrFail({ id: target.feeId }),
        true,
      );
    const captures = await this.db
      .getRepository(FeePaymentCapture)
      .findBy({ paymentId: payment.id });
    const refunds = captures.length
      ? await this.db
          .getRepository(FeeProviderRefund)
          .findBy({ captureId: In(captures.map((capture) => capture.id)) })
      : [];
    return {
      id: payment.id,
      amount: payment.amount,
      mode: RECONCILIATION_MODE.SIMULATION,
      state: payment.state,
      payUrl:
        payment.state === FEE_PAYMENT_STATE.PENDING ? payment.payUrl : null,
      targets: payment.targets.map(({ feeId, amount }) => ({ feeId, amount })),
      paidAt: payment.paidAt,
      refunds: refunds.map(feeRefundPublicView),
    };
  }

  async handlesOrderCode(providerOrderCode: string) {
    return this.db.getRepository(FeePayment).existsBy({ providerOrderCode });
  }

  async webhook(input: unknown) {
    let verified: PayosWebhookResult;
    try {
      verified = await this.gateway().verifyWebhook(input);
    } catch {
      throw new UnauthorizedException('Invalid fee payment signature');
    }
    if (verified.isTestPing) return;
    await this.applyWebhook(verified);
  }

  async applyWebhook(verified: PayosWebhookResult) {
    if (verified.isTestPing) return;
    const payment = await this.db.getRepository(FeePayment).findOneBy({
      providerOrderCode: String(verified.orderCode),
    });
    if (!payment)
      throw new UnauthorizedException('Invalid fee payment reference');
    await this.apply(payment.id, {
      orderCode: verified.orderCode,
      status: verified.code === '00' ? PAYOS_STATUS.PAID : PAYOS_STATUS.PENDING,
      amount: verified.amount,
      amountPaid: verified.amount,
      providerTransId: verified.reference || null,
    });
  }

  private async apply(id: string, result: PayosPaymentResult) {
    await this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      const payment = await manager.findOne(FeePayment, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) throw new NotFoundException('Fee payment not found');
      if (
        payment.providerOrderCode &&
        Number(payment.providerOrderCode) !== result.orderCode
      )
        throw new UnauthorizedException('Invalid fee request');
      const outcome = providerOutcome(result.status);
      const partialCaptured =
        result.amountPaid > 0 &&
        (outcome === PAYMENT_PROVIDER_OUTCOME.FAILED ||
          (result.status === PAYOS_STATUS.UNDERPAID &&
            now > payment.targetDeadline));
      if (outcome !== PAYMENT_PROVIDER_OUTCOME.PAID && !partialCaptured) {
        if (
          payment.state !== FEE_PAYMENT_STATE.SUCCEEDED &&
          outcome === PAYMENT_PROVIDER_OUTCOME.FAILED
        ) {
          payment.state = FEE_PAYMENT_STATE.FAILED;
          payment.nextQueryAt = new Date(
            now.getTime() + FEE_PAYMENT_POLICY.FAILURE_QUERY_DELAY_MS,
          );
          await manager.save(payment);
        }
        return;
      }
      const providerTransId = result.providerTransId?.trim() || '';
      if (
        !providerTransId ||
        !Number.isSafeInteger(result.amountPaid) ||
        result.amountPaid <= 0 ||
        result.amountPaid > MAX_VND_AMOUNT
      )
        throw new ConflictException('Invalid capture');
      if (
        (await manager.existsBy(ExcessCapture, { providerTransId })) ||
        (await manager.existsBy(PaymentAttempt, { providerTransId })) ||
        (await manager.existsBy(PaymentRefund, { providerTransId }))
      )
        throw new ConflictException(
          'Capture already belongs to another payment source',
        );
      const existing = await manager.findOneBy(FeePaymentCapture, {
        providerTransId,
      });
      if (existing) {
        if (
          existing.paymentId !== payment.id ||
          existing.amount !== result.amountPaid
        )
          throw new ConflictException('Capture reference reused');
        return;
      }
      const capture = manager.create(FeePaymentCapture, {
        paymentId: payment.id,
        providerTransId,
        amount: result.amountPaid,
        allocatedAmount: 0,
      });
      await manager.save(capture);
      if (partialCaptured) {
        await this.queueRefund(manager, capture.id, capture.amount, null, now);
        if (payment.state !== FEE_PAYMENT_STATE.SUCCEEDED) {
          payment.state = FEE_PAYMENT_STATE.FAILED;
          payment.nextQueryAt = new Date(
            now.getTime() + FEE_PAYMENT_POLICY.FAILURE_QUERY_DELAY_MS,
          );
          await manager.save(payment);
        }
        return;
      }
      await this.allocateCapture(manager, payment, capture, now);
    });
  }

  private async allocateCapture(
    manager: EntityManager,
    payment: FeePayment,
    capture: FeePaymentCapture,
    now: Date,
  ) {
    const capacities: number[] = [];
    for (const target of payment.targets) {
      const fee = await manager.findOneByOrFail(FeeAssessment, {
        id: target.feeId,
      });
      capacities.push(
        payment.state !== FEE_PAYMENT_STATE.SUCCEEDED &&
          now <= payment.targetDeadline &&
          fee.mode === RECONCILIATION_MODE.SIMULATION &&
          fee.status === FEE_STATUS.ACTIVE &&
          fee.notifiedAt &&
          fee.dueAt
          ? Math.min(target.amount, await feeOutstanding(manager, fee.id))
          : 0,
      );
    }
    const allocation = allocateFeeCapture(
      payment.amount,
      capture.amount,
      capacities,
    );
    for (let index = 0; index < payment.targets.length; index++) {
      if (allocation.allocations[index] > 0)
        await recordFeeCollection(
          manager,
          {
            feeId: payment.targets[index].feeId,
            mode: RECONCILIATION_MODE.SIMULATION,
            method: FEE_COLLECTION_METHOD.PAYOS,
            sourceId: capture.id,
            amount: allocation.allocations[index],
          },
          now,
        );
    }
    capture.allocatedAmount = capture.amount - allocation.refund;
    await manager.save(capture);
    if (allocation.refund > 0)
      await this.queueRefund(manager, capture.id, allocation.refund, null, now);
    payment.state = FEE_PAYMENT_STATE.SUCCEEDED;
    payment.paidAt ??= now;
    await manager.save(payment);
  }

  async queryAttempt(id: string) {
    const gateway = this.gateway();
    const orderCode = await this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      const payment = await manager.findOne(FeePayment, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !payment ||
        !payment.providerOrderCode ||
        payment.state === FEE_PAYMENT_STATE.SUCCEEDED ||
        payment.nextQueryAt > now
      )
        return null;
      payment.nextQueryAt = new Date(
        now.getTime() +
          (payment.state === FEE_PAYMENT_STATE.FAILED
            ? FEE_PAYMENT_POLICY.FAILURE_QUERY_DELAY_MS
            : FEE_PAYMENT_LEASE_MS),
      );
      await manager.save(payment);
      return Number(payment.providerOrderCode);
    });
    if (!orderCode) return;
    try {
      await this.apply(id, await gateway.getPaymentLink(orderCode));
    } catch {
      /* Persisted query lease preserves uncertainty. */
    }
  }

  private async queueRefund(
    manager: EntityManager,
    captureId: string,
    amount: number,
    feeRefundId: string | null,
    now: Date,
  ) {
    const unsupported =
      amount < PAYMENT_MIN_AMOUNT || amount > PAYMENT_MAX_AMOUNT;
    return manager.save(
      manager.create(FeeProviderRefund, {
        captureId,
        amount,
        feeRefundId,
        requestId: randomUUID(),
        state: FEE_PROVIDER_REFUND_STATE.REVIEW,
        nextQueryAt: now,
        alertedAt: now,
        responseDueAt: new Date(
          now.getTime() + FEE_PAYMENT_POLICY.ADMIN_RESPONSE_WINDOW_MS,
        ),
        history: [
          {
            at: now.toISOString(),
            state: unsupported
              ? FEE_PAYMENT_EVENT.PROVIDER_REFUND_LIMIT
              : FEE_PAYMENT_EVENT.ADMIN_RESPONSE_REQUIRED,
          },
        ],
      }),
    );
  }

  async runRefunds() {
    await this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      const corrections = await manager.findBy(FeeRefund, {
        method: FEE_COLLECTION_METHOD.PAYOS,
        state: In([FEE_PAYMENT_STATE.PENDING, FEE_PAYMENT_STATE.UNKNOWN]),
      });
      for (const correction of corrections) {
        if (
          await manager.existsBy(FeeProviderRefund, {
            feeRefundId: correction.id,
          })
        )
          continue;
        const capture = await manager.findOneByOrFail(FeePaymentCapture, {
          id: correction.sourceId,
        });
        const reserved = await manager.findBy(FeeProviderRefund, {
          captureId: capture.id,
        });
        if (
          reserved.reduce((sum, refund) => sum + refund.amount, 0) +
            correction.amount >
          capture.amount
        )
          throw new ConflictException(
            'Original capture refund capacity exceeded',
          );
        await this.queueRefund(
          manager,
          capture.id,
          correction.amount,
          correction.id,
          now,
        );
      }
    });
    const jobs = await this.db.getRepository(FeeProviderRefund).find({
      where: {
        state: In([
          FEE_PAYMENT_STATE.PENDING,
          FEE_PAYMENT_STATE.UNKNOWN,
          FEE_PROVIDER_REFUND_STATE.REVIEW,
        ]),
        nextQueryAt: LessThanOrEqual(new Date()),
      },
      order: { nextQueryAt: 'ASC', id: 'ASC' },
      take: FEE_PAYMENT_POLICY.BATCH_SIZE,
    });
    for (const job of jobs) await this.refund(job.id);
  }

  async refund(id: string) {
    this.gateway();
    await this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      const refund = await manager.findOne(FeeProviderRefund, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !refund ||
        refund.state === FEE_PAYMENT_STATE.SUCCEEDED ||
        refund.nextQueryAt > now
      )
        return;
      if (!refund.alertedAt) {
        refund.alertedAt = now;
        refund.responseDueAt = new Date(
          now.getTime() + FEE_PAYMENT_POLICY.ADMIN_RESPONSE_WINDOW_MS,
        );
        refund.history.push({
          at: now.toISOString(),
          state: FEE_PAYMENT_EVENT.ADMIN_RESPONSE_REQUIRED,
        });
      }
      refund.state = FEE_PROVIDER_REFUND_STATE.REVIEW;
      refund.nextQueryAt = new Date(
        now.getTime() + FEE_PAYMENT_POLICY.ADMIN_RESPONSE_WINDOW_MS,
      );
      await manager.save(refund);
      if (refund.feeRefundId)
        await manager.update(
          FeeRefund,
          { id: refund.feeRefundId },
          { state: FEE_PROVIDER_REFUND_STATE.REVIEW },
        );
    });
  }

  async pendingRefunds(userId: string) {
    const admin = await this.db.getRepository(User).findOneBy({
      id: userId,
      status: UserStatus.ACTIVE,
      role: UserRole.ADMIN,
    });
    if (!admin) throw new UnauthorizedException();
    const refunds = await this.db.getRepository(FeeProviderRefund).find({
      where: {
        state: In([
          FEE_PROVIDER_REFUND_STATE.PENDING,
          FEE_PROVIDER_REFUND_STATE.UNKNOWN,
          FEE_PROVIDER_REFUND_STATE.REVIEW,
        ]),
      },
      order: { nextQueryAt: 'ASC', id: 'ASC' },
      take: FEE_PAYMENT_POLICY.TARGET_LIMIT,
    });
    return Promise.all(
      refunds.map(async (refund) => {
        const capture = await this.db
          .getRepository(FeePaymentCapture)
          .findOneByOrFail({ id: refund.captureId });
        const correction = refund.feeRefundId
          ? await this.db
              .getRepository(FeeRefund)
              .findOneByOrFail({ id: refund.feeRefundId })
          : null;
        return {
          ...feeRefundPublicView(refund),
          captureId: capture.id,
          paymentId: capture.paymentId,
          feeRefundId: refund.feeRefundId,
          feeId: correction?.feeId ?? null,
          collectionId: correction?.collectionId ?? null,
          providerTransId: capture.providerTransId,
          requestId: refund.requestId,
          history: refund.history,
        };
      }),
    );
  }

  async respondToRefund(userId: string, id: string, message: string) {
    const admin = await this.db.getRepository(User).findOneBy({
      id: userId,
      status: UserStatus.ACTIVE,
      role: UserRole.ADMIN,
    });
    if (!admin) throw new UnauthorizedException();
    return this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      const user = await manager.findOneBy(User, {
        id: userId,
        status: UserStatus.ACTIVE,
        role: UserRole.ADMIN,
      });
      if (!user) throw new UnauthorizedException();
      const refund = await manager.findOneByOrFail(FeeProviderRefund, { id });
      refund.history.push({
        at: now.toISOString(),
        state: FEE_PAYMENT_EVENT.ADMIN_RESPONSE + ' ' + userId + ': ' + message,
      });
      await manager.save(refund);
      return {
        id: refund.id,
        state: refund.state,
        amount: refund.amount,
        captureId: refund.captureId,
        alertedAt: refund.alertedAt,
        responseDueAt: refund.responseDueAt,
        history: refund.history,
      };
    });
  }

  async run() {
    if (!this.client) return;
    const attempts = await this.db.getRepository(FeePayment).find({
      where: {
        state: In([
          FEE_PAYMENT_STATE.CREATING,
          FEE_PAYMENT_STATE.PENDING,
          FEE_PAYMENT_STATE.UNKNOWN,
          FEE_PAYMENT_STATE.FAILED,
        ]),
        nextQueryAt: LessThanOrEqual(new Date()),
      },
      order: { nextQueryAt: 'ASC', id: 'ASC' },
      take: FEE_PAYMENT_POLICY.BATCH_SIZE,
    });
    for (const attempt of attempts) await this.queryAttempt(attempt.id);
    await this.runRefunds();
  }
}
