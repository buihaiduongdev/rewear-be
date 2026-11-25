import { createHash, randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import {
  GhnShipmentClient,
  GhnShipmentSnapshot,
} from '@/infrastructure/shipping/clients/ghn-shipment.client';
import {
  GHN_IN_TRANSIT_STATUSES,
  GHN_SHIPMENT_STATUS,
} from '@/infrastructure/shipping/constants/ghn-shipment.constant';
import { shipmentPayloadSchema } from '@/infrastructure/shipping/schemas/ghn-shipment.schema';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { DisputeAccess } from '../dispute.access';
import {
  RETURN_BOOKING_POLICY as POLICY,
  RETURN_BOOKING_INSTRUCTIONS,
  RETURN_BOOKING_STATE as STATE,
} from './constants/return-booking.constant';
import { RETURN_STATE } from './constants/return.constant';
import { DisputeReturn } from './entities/dispute-return.entity';
import { ReturnBooking } from './entities/return-booking.entity';
import {
  installReturnLabel,
  pauseReturnForCarrier,
  replaceReturnLabel,
} from './return.lifecycle';
import {
  ReturnBookingInput,
  returnBookingInputSchema,
} from './schemas/return-booking.schema';

export function reverseReturnPayload(
  forward: Record<string, unknown>,
  clientCode: string,
  parcel: ReturnBookingInput['parcel'],
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
      )
        throw new ConflictException('Original shipment route requires review');
    }
    const ids =
      Number.isSafeInteger(route[`${target}_district_id`]) &&
      Number(route[`${target}_district_id`]) > 0 &&
      typeof route[`${target}_ward_code`] === 'string' &&
      !!route[`${target}_ward_code`];
    const names = ['province_name', 'ward_name'].every(
      (suffix) =>
        typeof route[`${target}_${suffix}`] === 'string' &&
        !!String(route[`${target}_${suffix}`]).trim(),
    );
    if (!ids && !names)
      throw new ConflictException('Original shipment route requires review');
    route[`is_new_${target}_address`] = !ids;
  }
  return shipmentPayloadSchema.parse({
    ...route,
    client_order_code: clientCode,
    payment_type_id: POLICY.PAYMENT_TYPE,
    cod_amount: POLICY.COD_AMOUNT,
    cod_failed_amount: POLICY.COD_AMOUNT,
    insurance_value: POLICY.DECLARED_VALUE,
    order_value: POLICY.DECLARED_VALUE,
    weight: parcel.weightGrams,
    length: parcel.lengthCm,
    width: parcel.widthCm,
    height: parcel.heightCm,
    service_type_id:
      parcel.weightGrams < POLICY.HEAVY_PARCEL_GRAMS
        ? POLICY.STANDARD_SERVICE
        : POLICY.HEAVY_SERVICE,
    required_note: 'KHONGCHOXEMHANG',
    content: POLICY.CONTENT,
    items: [
      {
        name: POLICY.CONTENT,
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
export class ReturnBookingService {
  private pollCursor: string | undefined;
  private readonly logger = new Logger(ReturnBookingService.name);
  async poll() {
    if (
      process.env.GHN_BOOKING_ENABLED !== 'true' ||
      process.env.GHN_SANDBOX_ENABLED !== 'true'
    )
      return;
    const query = this.db.manager
      .createQueryBuilder(ReturnBooking, 'booking')
      .innerJoin(DisputeReturn, 'obligation', 'obligation.id=booking.returnId')
      .select('booking.id', 'id')
      .where('booking.active=true')
      .andWhere(
        '(booking.nextQueryAt IS NULL OR booking.nextQueryAt <= clock_timestamp())',
      )
      .andWhere('obligation.state NOT IN (:...terminal)', {
        terminal: [RETURN_STATE.READY, RETURN_STATE.EXPIRED],
      })
      .orderBy('booking.id', 'ASC')
      .limit(POLICY.BATCH_SIZE);
    if (this.pollCursor)
      query.andWhere('booking.id > :cursor', { cursor: this.pollCursor });
    const candidates = await query.getRawMany<{ id: string }>();
    for (const candidate of candidates) {
      this.pollCursor = candidate.id;
      const claimed = await this.db.transaction(async (manager) => {
        const [{ now: clock }] = await manager.query(
          'SELECT clock_timestamp() AS now',
        );
        const now = new Date(clock),
          row = await manager.findOneBy(ReturnBooking, {
            id: candidate.id,
            active: true,
          });
        if (!row || (row.nextQueryAt && row.nextQueryAt > now)) return null;
        row.nextQueryAt = new Date(now.getTime() + POLICY.QUERY_LEASE_MS);
        return manager.save(row);
      });
      if (!claimed) continue;
      try {
        await this.observe(
          claimed,
          await this.carrier.query(claimed.clientCode, claimed.accountId),
        );
      } catch {
        this.logger.warn({
          returnBookingId: claimed.id,
          message: 'Carrier observation not verified; preserve return hold',
        });
      }
    }
    if (candidates.length < POLICY.BATCH_SIZE) this.pollCursor = undefined;
  }

  constructor(
    private readonly db: DataSource,
    private readonly carrier: GhnShipmentClient,
    private readonly access: DisputeAccess,
  ) {}
  private async admin(manager: EntityManager, userId: string) {
    await manager.findOneByOrFail(User, {
      id: userId,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });
  }
  async book(adminId: string, returnId: string, input: ReturnBookingInput) {
    const data = returnBookingInputSchema.parse(input);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ returnId, ...data }))
      .digest('hex');
    const claim = await this.db.transaction(async (manager) => {
      await this.admin(manager, adminId);
      const row = await manager.findOneByOrFail(DisputeReturn, {
        id: returnId,
      });
      const replay = await manager.findOneBy(ReturnBooking, {
        requestId: data.requestId,
      });
      if (
        replay &&
        (replay.returnId !== returnId || replay.fingerprint !== fingerprint)
      )
        throw new ConflictException('Return booking request already used');
      const existing =
        replay ??
        (await manager.findOneBy(ReturnBooking, { returnId, active: true }));
      if (existing) {
        if (!existing.active)
          throw new ConflictException(
            'Archived return booking cannot be reused',
          );
        if (existing.fingerprint !== fingerprint)
          throw new ConflictException('Return parcel snapshot is immutable');
        return { row: existing, create: false };
      }
      if (
        row.state !== 'WAITING_LABEL' ||
        row.labelCode ||
        row.handoverAt ||
        row.readyAt
      )
        throw new ConflictException(
          'Return already has a label or completed obligation',
        );
      const forward = await manager.findOneByOrFail(Shipment, {
        orderId: row.orderId,
      });
      const accountId =
        forward.input.ghnShopId ?? Number(process.env.GHN_SANDBOX_SHOP_ID);
      if (
        !Number.isSafeInteger(accountId) ||
        accountId <= 0 ||
        process.env.GHN_BOOKING_ENABLED !== 'true' ||
        process.env.GHN_SANDBOX_ENABLED !== 'true' ||
        !process.env.GHN_SANDBOX_TOKEN?.trim()
      )
        throw new ServiceUnavailableException('GHN_BOOKING_UNAVAILABLE');
      const booking = manager.create(ReturnBooking, {
        returnId,
        requestId: data.requestId,
        fingerprint,
        clientCode: returnId,
        active: true,
        priorLabel: null,
        state: STATE.CREATING,
        mode: 'SIMULATION',
        accountId,
        payload: reverseReturnPayload(forward.payload, returnId, data.parcel),
        orderCode: null,
        observedStatus: null,
        observedAt: null,
        reviewRequired: false,
      });
      await manager.save(booking);
      return { row: booking, create: true };
    });
    return this.finishClaim(adminId, claim);
  }
  private async finishClaim(
    adminId: string,
    claim: { row: ReturnBooking; create: boolean },
  ) {
    if (claim.row.state === STATE.BOOKED) return claim.row;
    if (!claim.create) return this.refresh(adminId, claim.row.returnId);
    try {
      const created = await this.carrier.create(
        claim.row.payload,
        claim.row.accountId,
      );
      // Confirm account, client code, and prepaid terms before publishing a label.
      return await this.observe(
        claim.row,
        await this.carrier.query(claim.row.clientCode, claim.row.accountId),
        created.orderCode,
      );
    } catch {
      await this.db.transaction(async (manager) => {
        const row = await manager.findOneByOrFail(ReturnBooking, {
          id: claim.row.id,
        });
        if (row.state !== STATE.BOOKED) {
          row.state = STATE.UNKNOWN;
          row.reviewRequired = true;
          await manager.save(row);
        }
      });
      throw new ServiceUnavailableException(
        'Return booking outcome requires carrier reconciliation; retry queries only',
      );
    }
  }
  async refresh(adminId: string, returnId: string) {
    await this.admin(this.db.manager, adminId);
    const row = await this.db.manager.findOneByOrFail(ReturnBooking, {
      returnId,
      active: true,
    });
    return this.observe(
      row,
      await this.carrier.query(row.clientCode, row.accountId),
    );
  }
  private validateSnapshot(
    expected: ReturnBooking,
    snapshot: GhnShipmentSnapshot,
    createdCode?: string,
  ) {
    if (
      snapshot.clientCode !== expected.clientCode ||
      snapshot.shopId !== expected.accountId ||
      snapshot.codAmount !== 0 ||
      snapshot.paymentType !== 1 ||
      snapshot.codCollected ||
      snapshot.codTransferred ||
      (expected.orderCode && snapshot.orderCode !== expected.orderCode) ||
      (createdCode && snapshot.orderCode !== createdCode)
    )
      throw new ConflictException('Return carrier snapshot mismatch');
  }
  async reissue(adminId: string, returnId: string, input: ReturnBookingInput) {
    const data = returnBookingInputSchema.parse(input);
    await this.admin(this.db.manager, adminId);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ returnId, ...data }))
      .digest('hex');
    const replay = await this.db.manager.findOneBy(ReturnBooking, {
      requestId: data.requestId,
    });
    if (replay) {
      if (
        !replay.active ||
        replay.returnId !== returnId ||
        replay.fingerprint !== fingerprint
      )
        throw new ConflictException('Return booking request already used');
      return this.finishClaim(adminId, { row: replay, create: false });
    }
    const old = await this.db.manager.findOneByOrFail(ReturnBooking, {
      returnId,
      active: true,
    });
    // Never turn an ambiguous creation into a second parcel, even if a later query looks cancelled.
    if (old.state !== STATE.BOOKED || !old.orderCode)
      throw new ConflictException(
        'Confirmed cancellation of known parcel required',
      );
    const snapshot = await this.carrier.query(old.clientCode, old.accountId);
    this.validateSnapshot(old, snapshot);
    if (snapshot.status !== GHN_SHIPMENT_STATUS.CANCEL)
      throw new ConflictException('Carrier has not confirmed cancellation');
    const claim = await this.db.transaction(async (manager) => {
      await this.admin(manager, adminId);
      const current = await manager.findOneByOrFail(ReturnBooking, {
        id: old.id,
        active: true,
      });
      if (current.orderCode !== old.orderCode || current.state !== STATE.BOOKED)
        throw new ConflictException('Return booking changed');
      const obligation = await manager.findOneByOrFail(DisputeReturn, {
        id: returnId,
      });
      if (obligation.handoverAt || obligation.deliveredAt || obligation.readyAt)
        throw new ConflictException('Return movement prevents reissue');
      if (obligation.labelCode) {
        await pauseReturnForCarrier(
          manager,
          obligation,
          new Date(),
          'CARRIER_LABEL_UNUSABLE',
        );
      } else if (obligation.state !== 'WAITING_LABEL') {
        throw new ConflictException(
          'Unpublished cancelled parcel requires an untouched return obligation',
        );
      }
      current.active = false;
      current.observedStatus = snapshot.status;
      current.observedAt = new Date();
      current.reviewRequired = true;
      current.priorLabel = {
        code: obligation.labelCode,
        instructions: obligation.instructions,
        notifiedAt: obligation.labelNotifiedAt?.toISOString() ?? null,
        handoverBy: obligation.handoverBy?.toISOString() ?? null,
      };
      await manager.save(current);
      const forward = await manager.findOneByOrFail(Shipment, {
        orderId: obligation.orderId,
      });
      const clientCode = randomUUID();
      const row = manager.create(ReturnBooking, {
        returnId,
        requestId: data.requestId,
        fingerprint,
        clientCode,
        active: true,
        priorLabel: null,
        state: STATE.CREATING,
        mode: old.mode,
        accountId: old.accountId,
        payload: reverseReturnPayload(forward.payload, clientCode, data.parcel),
        orderCode: null,
        observedStatus: null,
        observedAt: null,
        reviewRequired: false,
      });
      await manager.save(row);
      return { row, create: true };
    });
    return this.finishClaim(adminId, claim);
  }
  private async observe(
    expected: ReturnBooking,
    snapshot: GhnShipmentSnapshot,
    createdCode?: string,
  ) {
    this.validateSnapshot(expected, snapshot, createdCode);
    return this.db.transaction(async (manager) => {
      const row = await manager.findOneByOrFail(ReturnBooking, {
        id: expected.id,
        active: true,
      });
      if (row.orderCode && row.orderCode !== snapshot.orderCode)
        throw new ConflictException('Return label changed');
      row.orderCode = snapshot.orderCode;
      row.state = STATE.BOOKED;
      row.observedStatus = snapshot.status;
      row.observedAt = new Date();
      row.nextQueryAt = new Date(
        row.observedAt.getTime() + POLICY.POLL_INTERVAL_MS,
      );
      const obligation = await manager.findOneByOrFail(DisputeReturn, {
        id: row.returnId,
      });
      const usable = (
        [
          GHN_SHIPMENT_STATUS.READY_TO_PICK,
          ...GHN_IN_TRANSIT_STATUSES,
          GHN_SHIPMENT_STATUS.DELIVERED,
        ] as readonly string[]
      ).includes(snapshot.status);
      row.reviewRequired =
        !usable ||
        snapshot.status !== GHN_SHIPMENT_STATUS.READY_TO_PICK ||
        (obligation.labelReplacementRequired &&
          obligation.labelCode === row.orderCode);
      if (!usable && obligation.labelCode && !obligation.handoverAt) {
        await pauseReturnForCarrier(
          manager,
          obligation,
          new Date(),
          'CARRIER_LABEL_UNUSABLE',
        );
      } else if (!usable) {
        // Persist the signed observation without publishing an unusable label.
      } else if (
        obligation.labelCode &&
        obligation.labelCode !== row.orderCode
      ) {
        await replaceReturnLabel(
          manager,
          obligation,
          {
            mode: row.mode,
            waybillCode: snapshot.orderCode,
            instructions: RETURN_BOOKING_INSTRUCTIONS,
          },
          new Date(),
        );
      } else {
        await installReturnLabel(
          manager,
          obligation,
          {
            mode: row.mode,
            waybillCode: snapshot.orderCode,
            instructions: RETURN_BOOKING_INSTRUCTIONS,
          },
          new Date(),
        );
      }
      return manager.save(row);
    });
  }
  async view(userId: string, returnId: string, admin = false) {
    const row = await this.db.manager.findOneByOrFail(DisputeReturn, {
      id: returnId,
    });
    if (admin) await this.admin(this.db.manager, userId);
    else await this.access.assertParty(this.db.manager, userId, row.orderId);
    return this.db.manager.findOneBy(ReturnBooking, { returnId, active: true });
  }
  async print(userId: string, returnId: string, admin = false) {
    let row = await this.view(userId, returnId, admin);
    if (row?.reviewRequired)
      throw new ConflictException('Return label requires review');
    if (row)
      row = await this.observe(
        row,
        await this.carrier.query(row.clientCode, row.accountId),
      );
    if (
      !row?.orderCode ||
      row.state !== STATE.BOOKED ||
      row.reviewRequired ||
      row.observedStatus !== GHN_SHIPMENT_STATUS.READY_TO_PICK
    )
      throw new ConflictException('Confirmed return label required');
    return this.carrier.print(row.orderCode, row.accountId);
  }
}
