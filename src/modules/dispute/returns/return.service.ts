import {
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { DataSource, EntityManager, IsNull, LessThan } from 'typeorm';

import { GhnShipmentClient } from '@/infrastructure/shipping/clients/ghn-shipment.client';
import { shipmentPayloadSchema } from '@/infrastructure/shipping/schemas/ghn-shipment.schema';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { Order } from '@/modules/order/entities';
import { OrderAccess } from '@/modules/order/order.access';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import {
  DISPUTE_DECISION_OUTCOME,
  DISPUTE_ISSUE_STATE,
} from '../constants/dispute.constant';
import { DisputeRefundService } from '../dispute-refund.service';
import { DisputeAccess, restoreDisputeCaseIfClear } from '../dispute.access';
import { DisputeCase } from '../entities/dispute-case.entity';
import { DisputeDecision } from '../entities/dispute-decision.entity';
import { DisputeIssue } from '../entities/dispute-issue.entity';
import type {
  ReturnCarrierStatusInput,
  ReturnLabelInput,
  ReturnParcelInput,
} from '../schemas/dispute.schema';
import {
  returnCarrierStatusSchema,
  returnLabelInputSchema,
} from '../schemas/dispute.schema';
import {
  RETURN_BOOKING_INSTRUCTIONS,
  RETURN_POLICY,
  RETURN_STATE,
} from './constants/return.constant';
import { DisputeReturn } from './entities/dispute-return.entity';

export function reverseReturnPayload(
  forward: Record<string, unknown>,
  clientCode: string,
  parcel: ReturnParcelInput,
) {
  const route: Record<string, unknown> = {};
  for (const [source, target] of [
    ['to', 'from'],
    ['from', 'to'],
  ]) {
    for (const suffix of [
      'name',
      'phone',
      'address',
      'province_name',
      'ward_name',
      'district_id',
      'ward_code',
    ]) {
      const value = forward[`${source}_${suffix}`];
      if (value !== undefined) route[`${target}_${suffix}`] = value;
    }
    for (const suffix of ['name', 'phone', 'address']) {
      if (
        typeof route[`${target}_${suffix}`] !== 'string' ||
        !String(route[`${target}_${suffix}`]).trim()
      ) {
        throw new ConflictException('Original shipment route requires review');
      }
    }
    const ids =
      Number.isSafeInteger(route[`${target}_district_id`]) &&
      Number(route[`${target}_district_id`]) > 0 &&
      typeof route[`${target}_ward_code`] === 'string' &&
      Boolean(route[`${target}_ward_code`]);
    const names = ['province_name', 'ward_name'].every(
      (suffix) =>
        typeof route[`${target}_${suffix}`] === 'string' &&
        Boolean(String(route[`${target}_${suffix}`]).trim()),
    );
    if (!ids && !names) {
      throw new ConflictException('Original shipment route requires review');
    }
    route[`is_new_${target}_address`] = !ids;
  }
  return shipmentPayloadSchema.parse({
    ...route,
    client_order_code: clientCode,
    payment_type_id: RETURN_POLICY.PAYMENT_TYPE,
    cod_amount: RETURN_POLICY.COD_AMOUNT,
    cod_failed_amount: RETURN_POLICY.COD_AMOUNT,
    insurance_value: RETURN_POLICY.DECLARED_VALUE,
    order_value: RETURN_POLICY.DECLARED_VALUE,
    weight: parcel.weightGrams,
    length: parcel.lengthCm,
    width: parcel.widthCm,
    height: parcel.heightCm,
    service_type_id:
      parcel.weightGrams < RETURN_POLICY.HEAVY_PARCEL_GRAMS
        ? RETURN_POLICY.STANDARD_SERVICE
        : RETURN_POLICY.HEAVY_SERVICE,
    required_note: 'KHONGCHOXEMHANG',
    content: RETURN_POLICY.CONTENT,
    items: [
      {
        name: RETURN_POLICY.CONTENT,
        quantity: 1,
        price: 0,
        weight: parcel.weightGrams,
        length: parcel.lengthCm,
        width: parcel.widthCm,
        height: parcel.heightCm,
      },
    ],
  });
}

@Injectable()
export class DisputeReturnService {
  constructor(
    private readonly db: DataSource,
    private readonly carrier: GhnShipmentClient,
    private readonly access: DisputeAccess,
    private readonly orders: OrderAccess,
    private readonly refunds: DisputeRefundService,
  ) {}

  private async lockOrderAndReturn(manager: EntityManager, id: string) {
    const meta = await manager
      .createQueryBuilder(DisputeReturn, 'r')
      .where('r.id = :id', { id })
      .select('r.orderId', 'orderId')
      .getRawOne<{ orderId: string }>();
    if (!meta) {
      await manager.findOneByOrFail(DisputeReturn, { id });
      throw new ConflictException('Return record missing');
    }
    await manager.findOneOrFail(Order, {
      where: { id: meta.orderId },
      lock: { mode: 'pessimistic_write' },
    });
    return manager.findOneOrFail(DisputeReturn, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  async ensureReturn(
    manager: EntityManager,
    decision: DisputeDecision,
    issue: DisputeIssue,
    disputeCase: DisputeCase,
  ) {
    if (decision.finalOutcome !== DISPUTE_DECISION_OUTCOME.REQUIRE_RETURN) {
      throw new ConflictException('Decision does not require item return');
    }
    const existing = await manager.findOneBy(DisputeReturn, {
      remedyKey: decision.remedyKey,
    });
    if (existing) return existing;
    return manager.save(
      DisputeReturn,
      manager.create(DisputeReturn, {
        decisionId: decision.id,
        remedyKey: decision.remedyKey,
        orderId: disputeCase.orderId,
        productId: issue.productId,
        buyerId: disputeCase.buyerId,
        shopId: disputeCase.shopId,
        state: RETURN_STATE.WAITING_LABEL,
        mode: null,
        labelCode: null,
        instructions: null,
        handoverBy: null,
        handoverAt: null,
        deliveredAt: null,
        readyAt: null,
      }),
    );
  }

  async read(userId: string, id: string, admin = false) {
    const manager = this.db.manager;
    const row = await manager.findOneByOrFail(DisputeReturn, { id });
    if (admin) {
      await manager.findOneByOrFail(User, {
        id: userId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      });
    } else {
      await this.access.assertParty(manager, userId, row.orderId);
    }
    return row;
  }

  async createLabel(adminId: string, id: string, input: ReturnLabelInput) {
    const data = returnLabelInputSchema.parse(input);
    let bookedCode = data.waybillCode;
    let mode = data.mode;

    if (!bookedCode && data.parcel) {
      const target = await this.db.manager.findOneByOrFail(DisputeReturn, {
        id,
      });
      await this.db.manager.findOneByOrFail(User, {
        id: adminId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      });
      if (target.state !== RETURN_STATE.WAITING_LABEL) {
        throw new ConflictException('Return is not waiting for label');
      }
      const forward = await this.db.manager.findOneByOrFail(Shipment, {
        orderId: target.orderId,
      });
      const accountId =
        forward.input.ghnShopId ?? Number(process.env.GHN_SANDBOX_SHOP_ID);
      if (
        !Number.isSafeInteger(accountId) ||
        accountId <= 0 ||
        process.env.GHN_BOOKING_ENABLED !== 'true' ||
        process.env.GHN_SANDBOX_ENABLED !== 'true' ||
        !process.env.GHN_SANDBOX_TOKEN?.trim()
      ) {
        throw new ServiceUnavailableException('GHN_BOOKING_UNAVAILABLE');
      }
      const created = await this.carrier.create(
        reverseReturnPayload(forward.payload, target.id, data.parcel),
        accountId,
      );
      bookedCode = created.orderCode;
      mode = RECONCILIATION_MODE.SIMULATION;
    }

    return this.db.transaction(async (manager) => {
      await manager.findOneByOrFail(User, {
        id: adminId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      });
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      const row = await this.lockOrderAndReturn(manager, id);
      if (row.labelCode) {
        if (row.labelCode === bookedCode) return row;
        throw new ConflictException('Return label already installed');
      }
      if (row.state !== RETURN_STATE.WAITING_LABEL) {
        throw new ConflictException('Return is not waiting for label');
      }
      row.mode = mode;
      row.labelCode = bookedCode!;
      row.instructions = data.instructions ?? RETURN_BOOKING_INSTRUCTIONS;
      row.handoverBy = new Date(now.getTime() + RETURN_POLICY.HANDOVER_MS);
      row.state = RETURN_STATE.AWAITING_HANDOVER;
      return manager.save(row);
    });
  }

  async recordHandover(userId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      const row = await this.lockOrderAndReturn(manager, id);
      const user = await manager.findOneByOrFail(User, {
        id: userId,
        status: UserStatus.ACTIVE,
      });
      if (user.role !== UserRole.ADMIN && row.buyerId !== userId) {
        throw new ForbiddenException(
          'Only buyer or Admin can record return handover',
        );
      }
      if (row.state === RETURN_STATE.IN_TRANSIT) return row;
      if (row.state !== RETURN_STATE.AWAITING_HANDOVER || !row.labelCode) {
        throw new ConflictException('Return is not awaiting handover');
      }
      if (row.handoverBy && now > row.handoverBy) {
        await this.markExpired(manager, row);
        throw new ConflictException('Return handover window expired');
      }
      row.handoverAt = now;
      row.state = RETURN_STATE.IN_TRANSIT;
      return manager.save(row);
    });
  }

  async updateCarrierStatus(
    adminId: string,
    id: string,
    input: ReturnCarrierStatusInput,
  ) {
    const data = returnCarrierStatusSchema.parse(input);
    return this.db.transaction(async (manager) => {
      await manager.findOneByOrFail(User, {
        id: adminId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      });
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      const observedAt = data.observedAt ? new Date(data.observedAt) : now;
      const row = await this.lockOrderAndReturn(manager, id);
      if (!row.labelCode) {
        throw new ConflictException('Return label is not installed');
      }
      if (row.state === RETURN_STATE.EXPIRED) {
        throw new ConflictException('Return has already expired');
      }
      if (data.status === 'IN_TRANSIT') {
        if (row.handoverBy && observedAt > row.handoverBy && !row.handoverAt) {
          await this.markExpired(manager, row);
          throw new ConflictException('Return handover window expired');
        }
        row.handoverAt ??= observedAt;
        if (row.state === RETURN_STATE.AWAITING_HANDOVER) {
          row.state = RETURN_STATE.IN_TRANSIT;
        }
        return manager.save(row);
      }
      if (!row.handoverAt && row.handoverBy && observedAt > row.handoverBy) {
        await this.markExpired(manager, row);
        throw new ConflictException('Return handover window expired');
      }
      row.handoverAt ??= observedAt;
      row.deliveredAt = observedAt;
      row.readyAt = now;
      row.state = RETURN_STATE.READY;
      await manager.save(row);
      await this.executeReadyRemedy(manager, row.remedyKey, now);
      return row;
    });
  }

  async confirmReceipt(userId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      const row = await this.lockOrderAndReturn(manager, id);
      await this.orders.assertManage(manager, userId, row.shopId);
      if (row.state === RETURN_STATE.READY) return row;
      if (
        (row.state !== RETURN_STATE.IN_TRANSIT &&
          row.state !== RETURN_STATE.AWAITING_HANDOVER) ||
        !row.labelCode
      ) {
        throw new ConflictException('Return is not in transit for receipt');
      }
      if (!row.handoverAt && row.handoverBy && now > row.handoverBy) {
        await this.markExpired(manager, row);
        throw new ConflictException('Return handover window expired');
      }
      row.handoverAt ??= now;
      row.deliveredAt ??= now;
      row.readyAt = now;
      row.state = RETURN_STATE.READY;
      await manager.save(row);
      await this.executeReadyRemedy(manager, row.remedyKey, now);
      return row;
    });
  }

  async expireDue(manager: EntityManager, now: Date) {
    const overdue = await manager.find(DisputeReturn, {
      select: { id: true },
      where: {
        state: RETURN_STATE.AWAITING_HANDOVER,
        handoverAt: IsNull(),
        handoverBy: LessThan(now),
      },
      take: 100,
    });
    for (const candidate of overdue) {
      const row = await this.lockOrderAndReturn(manager, candidate.id);
      if (
        row.state === RETURN_STATE.AWAITING_HANDOVER &&
        !row.handoverAt &&
        row.handoverBy &&
        now > row.handoverBy
      ) {
        await this.markExpired(manager, row);
      }
    }
  }

  private async executeReadyRemedy(
    manager: EntityManager,
    remedyKey: string,
    now: Date,
  ) {
    const decisions = await manager.find(DisputeDecision, {
      where: {
        remedyKey,
        finalOutcome: DISPUTE_DECISION_OUTCOME.REQUIRE_RETURN,
      },
      order: { finalizedAt: 'ASC', id: 'ASC' },
    });
    for (const decision of decisions) {
      if (decision.finalizedAt) {
        await this.refunds.executeInTransaction(manager, decision.id, now);
      }
    }
  }

  private async markExpired(manager: EntityManager, row: DisputeReturn) {
    row.state = RETURN_STATE.EXPIRED;
    await manager.save(row);
    const decisions = await manager.find(DisputeDecision, {
      where: {
        remedyKey: row.remedyKey,
        finalOutcome: DISPUTE_DECISION_OUTCOME.REQUIRE_RETURN,
      },
    });
    for (const decision of decisions) {
      const issue = await manager.findOneByOrFail(DisputeIssue, {
        id: decision.issueId,
      });
      if (issue.status === DISPUTE_ISSUE_STATE.AWAITING_EXECUTION) {
        issue.status = DISPUTE_ISSUE_STATE.RESOLVED_NO_REFUND;
        await manager.save(issue);
        await restoreDisputeCaseIfClear(manager, issue.caseId);
      }
    }
  }
}
