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

import {
  type MomoNotification,
  type MomoResult,
  MomoSandboxClient,
} from '@/infrastructure/payment/momo-sandbox.client';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { PAYMENT_PROVIDER_OUTCOME } from '@/modules/payment/constants/payment.constant';
import {
  PAYMENT_MAX_AMOUNT,
  PAYMENT_MIN_AMOUNT,
  PAYMENT_PROVIDER_SUCCESS_CODE,
  PAYMENT_REFUND_PENDING_CODES,
} from '@/modules/payment/constants/payment.constant';
import {
  PaymentAttempt,
  PaymentRefund,
} from '@/modules/payment/entities/payment.entity';
import { providerOutcome } from '@/modules/payment/policies/payment.policy';
import { ShopMember } from '@/modules/shop/entities/shop-member.entity';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';
import { ExcessCapture } from '@/modules/wallet/excess/entities/excess.entity';

import {
  FEE_COLLECTION_METHOD,
  FEE_PARTY,
  FEE_STATUS,
} from '../constants/fee.constant';
import { FeeAssessment, FeeRefund } from '../entities/fee.entity';
import { feeOutstanding, recordFeeCollection } from '../fee-accounting';
import {
  FEE_MOMO_CLIENT,
  FEE_PAYMENT_EVENT,
  FEE_PAYMENT_INFO_PREFIX,
  FEE_PAYMENT_LEASE_MS,
  FEE_PAYMENT_POLICY,
  FEE_PAYMENT_STATE,
  FEE_PROVIDER_REFUND_STATE,
} from './constants/fee-payment.constant';
import {
  FeePayment,
  FeePaymentCapture,
  FeeProviderRefund,
} from './entities/fee-payment.entity';
import {
  allocateFeeCapture,
  feeRefundPublicView,
  hasOverlappingFeeAttempt,
} from './fee-payment.policy';
import {
  type CreateFeePaymentInput,
  createFeePaymentSchema,
} from './schemas/fee-payment.schema';
import type { FeeTarget } from './types/fee-payment.type';

@Injectable()
export class FeePaymentService {
  constructor(
    private readonly db: DataSource,
    @Inject(FEE_MOMO_CLIENT) private readonly client: MomoSandboxClient | null,
  ) {}
  private gateway() {
    if (!this.client)
      throw new ServiceUnavailableException('MoMo Sandbox is disabled');
    return this.client;
  }
  private async lock(manager: EntityManager) {
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
        const result = await gateway.create({
          orderId: prepared.payment.id,
          requestId: prepared.payment.id,
          amount: prepared.payment.amount,
          orderInfo: FEE_PAYMENT_INFO_PREFIX + prepared.payment.id,
        });
        await this.db.transaction(async (manager) => {
          await this.lock(manager);
          const payment = await manager.findOneByOrFail(FeePayment, {
            id: prepared.payment.id,
          });
          if (payment.state === FEE_PAYMENT_STATE.SUCCEEDED) return;
          payment.state =
            providerOutcome(result.resultCode) === PAYMENT_PROVIDER_OUTCOME.PAID
              ? FEE_PAYMENT_STATE.PENDING
              : providerOutcome(result.resultCode) ===
                  PAYMENT_PROVIDER_OUTCOME.FAILED
                ? FEE_PAYMENT_STATE.FAILED
                : FEE_PAYMENT_STATE.UNKNOWN;
          payment.payUrl =
            payment.state === FEE_PAYMENT_STATE.PENDING
              ? (result.payUrl ?? null)
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
    const now = await this.lock(manager);
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
        throw new ConflictException('Fee is not payable through Sandbox');
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
  async handles(id: string) {
    return this.db.getRepository(FeePayment).existsBy({ id });
  }
  async ipn(input: MomoNotification) {
    let result: MomoNotification;
    try {
      result = this.gateway().verifyIpn(input);
    } catch {
      throw new UnauthorizedException('Invalid fee payment signature');
    }
    if (
      result.orderType !== 'momo_wallet' ||
      result.requestId !== result.orderId ||
      result.orderInfo !== FEE_PAYMENT_INFO_PREFIX + result.orderId
    )
      throw new UnauthorizedException('Invalid fee payment reference');
    await this.apply(result);
  }
  private async apply(result: MomoResult) {
    await this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const payment = await manager.findOneByOrFail(FeePayment, {
        id: result.orderId,
      });
      if (result.requestId !== payment.id)
        throw new UnauthorizedException('Invalid fee request');
      if (result.resultCode !== PAYMENT_PROVIDER_SUCCESS_CODE) {
        if (
          payment.state !== FEE_PAYMENT_STATE.SUCCEEDED &&
          providerOutcome(result.resultCode) === PAYMENT_PROVIDER_OUTCOME.FAILED
        ) {
          payment.state = FEE_PAYMENT_STATE.FAILED;
          payment.nextQueryAt = new Date(
            now.getTime() + FEE_PAYMENT_POLICY.FAILURE_QUERY_DELAY_MS,
          );
          await manager.save(payment);
        }
        return;
      }
      if (!Number.isSafeInteger(result.transId) || result.transId <= 0)
        throw new ConflictException('Invalid capture');
      if (
        (await manager.existsBy(ExcessCapture, {
          providerTransId: String(result.transId),
        })) ||
        (await manager.existsBy(PaymentAttempt, {
          providerTransId: String(result.transId),
        })) ||
        (await manager.existsBy(PaymentRefund, {
          providerTransId: String(result.transId),
        }))
      )
        throw new ConflictException(
          'Capture already belongs to a checkout payment',
        );
      const existing = await manager.findOneBy(FeePaymentCapture, {
        providerTransId: String(result.transId),
      });
      if (existing) {
        if (
          existing.paymentId !== payment.id ||
          existing.amount !== result.amount
        )
          throw new ConflictException('Capture reference reused');
        return;
      }
      const capture = manager.create(FeePaymentCapture, {
        paymentId: payment.id,
        providerTransId: String(result.transId),
        amount: result.amount,
        allocatedAmount: 0,
      });
      await manager.save(capture);
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
            method: FEE_COLLECTION_METHOD.MOMO,
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
    const payment = await this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const payment = await manager.findOneByOrFail(FeePayment, { id });
      if (
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
      return payment;
    });
    if (!payment) return;
    try {
      await this.apply(await gateway.query(id, id));
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
        state: unsupported
          ? FEE_PROVIDER_REFUND_STATE.REVIEW
          : FEE_PAYMENT_STATE.PENDING,
        nextQueryAt: now,
        alertedAt: unsupported ? now : null,
        responseDueAt: unsupported
          ? new Date(
              now.getTime() + FEE_PAYMENT_POLICY.ADMIN_RESPONSE_WINDOW_MS,
            )
          : null,
        history: [
          {
            at: now.toISOString(),
            state: unsupported
              ? FEE_PAYMENT_EVENT.PROVIDER_REFUND_LIMIT
              : FEE_PAYMENT_STATE.PENDING,
          },
        ],
      }),
    );
  }
  async runRefunds() {
    await this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const corrections = await manager.findBy(FeeRefund, {
        method: FEE_COLLECTION_METHOD.MOMO,
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
  private async leaseRefund(id: string) {
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const refund = await manager.findOneByOrFail(FeeProviderRefund, { id });
      if (
        refund.state === FEE_PAYMENT_STATE.SUCCEEDED ||
        refund.nextQueryAt > now
      )
        return null;
      if (
        !refund.alertedAt &&
        (refund.state === FEE_PROVIDER_REFUND_STATE.REVIEW ||
          now.getTime() - refund.createdAt.getTime() >=
            FEE_PAYMENT_POLICY.REFUND_ALERT_AFTER_MS)
      ) {
        refund.alertedAt = now;
        refund.responseDueAt = new Date(
          now.getTime() + FEE_PAYMENT_POLICY.ADMIN_RESPONSE_WINDOW_MS,
        );
        refund.history.push({
          at: now.toISOString(),
          state: FEE_PAYMENT_EVENT.ADMIN_RESPONSE_REQUIRED,
        });
      }
      if (refund.state === FEE_PROVIDER_REFUND_STATE.REVIEW) {
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
        return null;
      }
      const submit = refund.state === FEE_PAYMENT_STATE.PENDING;
      refund.state = FEE_PAYMENT_STATE.UNKNOWN;
      refund.nextQueryAt = new Date(now.getTime() + FEE_PAYMENT_LEASE_MS);
      await manager.save(refund);
      return {
        refund,
        submit,
        capture: await manager.findOneByOrFail(FeePaymentCapture, {
          id: refund.captureId,
        }),
      };
    });
  }
  async refund(id: string) {
    const gateway = this.gateway();
    const job = await this.leaseRefund(id);
    if (!job) return;
    try {
      let failed = false;
      if (job.submit) {
        const result = await gateway.refund({
          orderId: job.refund.id,
          requestId: job.refund.requestId,
          amount: job.refund.amount,
          transId: Number(job.capture.providerTransId),
        });
        failed = ![
          PAYMENT_PROVIDER_SUCCESS_CODE,
          ...PAYMENT_REFUND_PENDING_CODES,
        ].includes(result.resultCode);
      }
      // A submission response alone never confirms a source refund.
      const completed =
        !failed &&
        (await gateway.queryRefund(
          job.refund.id,
          job.refund.requestId,
          job.refund.amount,
        ));
      await this.db.transaction(async (manager) => {
        const now = await this.lock(manager);
        const refund = await manager.findOneByOrFail(FeeProviderRefund, { id });
        if (refund.state === FEE_PAYMENT_STATE.SUCCEEDED) return;
        refund.state = completed
          ? FEE_PAYMENT_STATE.SUCCEEDED
          : failed
            ? FEE_PROVIDER_REFUND_STATE.REVIEW
            : FEE_PAYMENT_STATE.UNKNOWN;
        refund.history.push({ at: now.toISOString(), state: refund.state });
        if (failed && !refund.alertedAt) {
          refund.alertedAt = now;
          refund.responseDueAt = new Date(
            now.getTime() + FEE_PAYMENT_POLICY.ADMIN_RESPONSE_WINDOW_MS,
          );
        }
        await manager.save(refund);
        if (refund.feeRefundId)
          await manager.update(
            FeeRefund,
            { id: refund.feeRefundId },
            {
              state: refund.state,
              completedAt: completed ? now : null,
              providerReference: completed ? job.capture.providerTransId : null,
            },
          );
      });
    } catch {
      /* Never submit again after an ambiguous response. */
    }
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
      const now = await this.lock(manager);
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
