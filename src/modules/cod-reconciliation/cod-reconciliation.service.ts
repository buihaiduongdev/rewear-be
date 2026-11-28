import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager, In, Not, QueryFailedError } from 'typeorm';

import { BASIS_POINTS_SCALE } from '@/common/constants/money.constant';
import { GHN_SHIPMENT_STATUS } from '@/infrastructure/shipping/constants/ghn-shipment.constant';
import { CoinService } from '@/modules/coins/coin.service';
import {
  ORDER_CANCEL_STATE,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities';
import type { OrderState } from '@/modules/order/schemas/order.schema';
import {
  SHIPMENT_STATE,
  UNSAFE_CARRIER_REVIEW_REASONS,
} from '@/modules/shipment/constants/shipment.constant';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { SHOP_LEDGER_ENTRY_TYPE } from '@/modules/shop-finance/constants/payout.constant';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';

import {
  COD_RECONCILIATION_STATUS,
  RECONCILIATION_REVIEW_REASON,
  SHOP_LEDGER_TYPE,
} from './constants/cod-reconciliation.constant';
import {
  CodCollection,
  CodRemittance,
  CodRemittanceAllocation,
} from './entities';
import type {
  CollectionContext,
  CollectionInput,
  FinanceListInput,
  ReconciliationMode,
  ReconciliationReviewReason,
  RemittanceAllocationInput,
  RemittanceInput,
  ValidatedRemittanceAllocation,
} from './schemas/cod-reconciliation.schema';
import {
  collectionInputSchema,
  reconciliationMoneySchema,
  remittanceInputSchema,
} from './schemas/cod-reconciliation.schema';

const DELIVERED_ORDER_STATES: readonly OrderState[] = [
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.DISPUTE,
  ORDER_STATUS.COMPLETED,
];

const isUniqueViolation = (error: unknown) =>
  error instanceof QueryFailedError &&
  (error as QueryFailedError & { driverError?: { code?: string } }).driverError
    ?.code === '23505';

export function requiresFulfillmentReview(
  order: Order,
  shipment: Shipment,
  _now?: Date,
): boolean {
  const isDeliveryVerified =
    DELIVERED_ORDER_STATES.includes(order.status) &&
    Boolean(order.deliveryObservedAt) &&
    shipment.providerStatus === GHN_SHIPMENT_STATUS.DELIVERED;

  const isShipmentCancelled = shipment.state === SHIPMENT_STATE.CANCELLED;
  const hasReturnInProgress = Boolean(
    shipment.returnRequestedAt || order.carrierReturnedAt,
  );
  const isCancellationUnresolved = Boolean(
    order.cancelState && order.cancelState !== ORDER_CANCEL_STATE.CLOSED,
  );
  const hasUnsafeCarrierData = Boolean(
    shipment.reviewReason &&
    UNSAFE_CARRIER_REVIEW_REASONS.includes(shipment.reviewReason),
  );

  return (
    !isDeliveryVerified ||
    isShipmentCancelled ||
    hasReturnInProgress ||
    isCancellationUnresolved ||
    order.handoverReviewRequired ||
    hasUnsafeCarrierData
  );
}

export function reconciliationMoney(input: unknown) {
  const parsed = reconciliationMoneySchema.safeParse(input);
  if (!parsed.success) throw new ConflictException('Invalid order money');
  const order = parsed.data;
  const commission = Number(
    order.items.reduce(
      (sum, item) =>
        sum +
        (BigInt(item.price) * BigInt(order.commissionBasisPoints)) /
          BigInt(BASIS_POINTS_SCALE),
      0n,
    ),
  );
  return {
    gross: order.subtotal,
    commission,
    sellerNet: order.subtotal - commission,
  };
}

@Injectable()
export class CodReconciliationService {
  constructor(
    private readonly db: DataSource,
    private readonly coinService: CoinService,
  ) {}

  private async now(manager: EntityManager) {
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }

  async recordCollection(
    adminId: string,
    orderId: string,
    input: CollectionInput,
  ) {
    const data = collectionInputSchema.parse(input);
    return this.db.transaction(async (manager) => {
      await manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (await manager.existsBy(CodCollection, { orderId })) {
        throw new ConflictException('Collection already recorded for order');
      }
      const context = await this.loadCollectionContext(manager, orderId, data);
      return this.createCollection(manager, adminId, context, data);
    });
  }

  async recordRemittance(adminId: string, input: RemittanceInput) {
    const data = remittanceInputSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const uniqueOrderIds = [
        ...new Set(data.allocations.map((a) => a.orderId)),
      ].sort();
      if (uniqueOrderIds.length > 0) {
        await manager.find(Order, {
          where: { id: In(uniqueOrderIds) },
          order: { id: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });
        await manager.find(Shipment, {
          where: { orderId: In(uniqueOrderIds) },
          order: { orderId: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });
      }
      const existing = await manager.findOne(CodRemittance, {
        where: { mode: data.mode, reference: data.reference },
        relations: { allocations: true },
      });
      if (existing) {
        return this.resolveExistingRemittance(existing, data);
      }
      const now = await this.now(manager);
      const receivedAt = new Date(data.receivedAt);
      if (receivedAt > now) throw new ConflictException('Invalid receipt time');
      const validated = await this.loadValidatedAllocations(
        manager,
        data,
        receivedAt,
      );
      const batch = await this.saveRemittance(
        manager,
        adminId,
        data,
        receivedAt,
      );
      const allocations = await this.applyAllocations(
        manager,
        batch,
        validated,
        now,
        adminId,
      );
      return { ...batch, allocations };
    });
  }

  private async updateProjection(
    manager: EntityManager,
    row: CodCollection,
    now: Date,
    adminId: string,
  ) {
    const order = await manager.findOneByOrFail(Order, { id: row.orderId });
    const shipment = await manager.findOneByOrFail(Shipment, {
      id: row.shipmentId,
    });
    row.reviewReason = this.fundingReviewReason(row, order, shipment, now);
    const grossReceived = row.cashReceived + row.feeDeducted;
    if (row.reviewReason) row.status = COD_RECONCILIATION_STATUS.REVIEW;
    else if (grossReceived === row.expectedAmount)
      await this.markFundedHeld(manager, row, now, adminId);
    else {
      row.status =
        grossReceived > 0
          ? COD_RECONCILIATION_STATUS.PARTIAL
          : COD_RECONCILIATION_STATUS.AWAITING;
    }
    await manager.save(row);
  }

  private fundingReviewReason(
    row: CodCollection,
    order: Order,
    shipment: Shipment,
    now: Date,
  ): ReconciliationReviewReason | null {
    if (row.collectedAmount < row.expectedAmount)
      return RECONCILIATION_REVIEW_REASON.SHORT_COLLECTION;
    if (row.collectedAmount > row.expectedAmount)
      return RECONCILIATION_REVIEW_REASON.EXCESS_COLLECTION;
    if (requiresFulfillmentReview(order, shipment, now))
      return RECONCILIATION_REVIEW_REASON.CARRIER_OR_ORDER_REQUIRES_REVIEW;
    if (!reconciliationMoneySchema.safeParse(order).success)
      return RECONCILIATION_REVIEW_REASON.CARRIER_OR_ORDER_REQUIRES_REVIEW;
    const money = reconciliationMoney(order);
    if (
      order.total !== row.expectedAmount ||
      money.gross !== row.gross ||
      money.commission !== row.commission ||
      money.sellerNet !== row.sellerNet
    )
      return RECONCILIATION_REVIEW_REASON.CARRIER_OR_ORDER_REQUIRES_REVIEW;
    return null;
  }

  private resolveExistingRemittance(
    existing: CodRemittance,
    data: RemittanceInput,
  ) {
    const existingAllocations = [...(existing.allocations ?? [])].sort((a, b) =>
      a.orderId.localeCompare(b.orderId),
    );
    const sameBatch =
      existing.netAmount === data.netAmount &&
      existing.receivedAt.getTime() === new Date(data.receivedAt).getTime() &&
      existing.reason === data.reason &&
      existing.evidence === data.evidence &&
      existingAllocations.length === data.allocations.length &&
      existingAllocations.every((allocation, index) => {
        const incoming = data.allocations[index];
        return (
          allocation.orderId === incoming.orderId &&
          allocation.cashAmount === incoming.cashAmount &&
          allocation.feeDeducted === incoming.feeDeducted
        );
      });
    if (!sameBatch) {
      throw new ConflictException('Remittance reference already recorded');
    }
    return { ...existing, allocations: existingAllocations };
  }

  async refresh(adminId: string, orderId: string) {
    return this.db.transaction(async (manager) => {
      await manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      await manager.findOne(Shipment, {
        where: { orderId },
        lock: { mode: 'pessimistic_write' },
      });
      const row = await manager.findOneOrFail(CodCollection, {
        where: { orderId },
        lock: { mode: 'pessimistic_write' },
      });
      await this.updateProjection(
        manager,
        row,
        await this.now(manager),
        adminId,
      );
      return row;
    });
  }

  async list(input: FinanceListInput = {}) {
    return this.db.getRepository(CodCollection).find({
      where: input.mode ? { mode: input.mode } : {},
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
      skip: input.offset ?? 0,
    });
  }

  async detail(orderId: string, input: Pick<FinanceListInput, 'offset'> = {}) {
    const manager = this.db.manager;
    const collection = await manager.findOneByOrFail(CodCollection, {
      orderId,
    });
    const allocations = await manager.find(CodRemittanceAllocation, {
      where: { collectionId: collection.id },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
      skip: input.offset ?? 0,
    });
    const remittanceIds = [
      ...new Set(allocations.map((row) => row.remittanceId)),
    ];
    const remittances = remittanceIds.length
      ? await manager.find(CodRemittance, {
          where: { id: In(remittanceIds) },
          relations: { allocations: true },
          order: { receivedAt: 'ASC', id: 'ASC' },
        })
      : [];
    return {
      collection,
      remittances: remittances.map((remittance) => ({
        ...remittance,
        allocations: [...remittance.allocations].sort((a, b) =>
          a.orderId.localeCompare(b.orderId),
        ),
      })),
    };
  }

  private async loadCollectionContext(
    manager: EntityManager,
    orderId: string,
    data: CollectionInput,
  ): Promise<CollectionContext> {
    const order = await manager.findOneOrFail(Order, {
      where: {
        id: orderId,
        paymentMethod: ORDER_PAYMENT_METHOD.COD,
      },
      lock: { mode: 'pessimistic_write' },
    });
    const shipment = await manager.findOneOrFail(Shipment, {
      where: { orderId },
      lock: { mode: 'pessimistic_write' },
    });
    const hasMatchingWaybill =
      Boolean(shipment.orderCode) && shipment.orderCode === data.waybillCode;
    const hasMatchingAmount = shipment.codAmount === order.total;
    if (!hasMatchingWaybill || !hasMatchingAmount)
      throw new ConflictException('COD waybill and expected amount must match');
    return { order, shipment };
  }

  private async createCollection(
    manager: EntityManager,
    adminId: string,
    context: CollectionContext,
    data: CollectionInput,
  ) {
    const { order, shipment } = context;
    const now = await this.now(manager);
    const collectedAt = new Date(data.collectedAt);
    if (collectedAt > now || collectedAt < order.createdAt)
      throw new ConflictException('Invalid collection time');
    const money = reconciliationMoney(order);
    if (data.collectedAmount === order.total && (order.coinDiscount ?? 0) > 0)
      await this.coinService.consumeOrderCoins(manager, order, data.mode, now);
    if (order.total <= 0)
      throw new ConflictException('COD expected amount must be positive');
    let row: CodCollection;
    try {
      row = await manager.save(
        CodCollection,
        manager.create(CodCollection, {
          ...data,
          orderId: order.id,
          shopId: order.shopId,
          shipmentId: shipment.id,
          actorId: adminId,
          expectedAmount: order.total,
          ...money,
          collectedAt,
          status: COD_RECONCILIATION_STATUS.AWAITING,
          cashReceived: 0,
          feeDeducted: 0,
          reviewReason: null,
          fundedAt: null,
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Collection already recorded for order');
      }
      throw error;
    }
    await this.updateProjection(manager, row, now, adminId);
    return row;
  }

  private async loadValidatedAllocations(
    manager: EntityManager,
    data: RemittanceInput,
    receivedAt: Date,
  ): Promise<ValidatedRemittanceAllocation[]> {
    const orderIds = [
      ...new Set(data.allocations.map((a) => a.orderId)),
    ].sort();
    const collections = await manager.find(CodCollection, {
      where: { orderId: In(orderIds) },
      order: { orderId: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    const collectionMap = new Map(collections.map((c) => [c.orderId, c]));

    const validated: ValidatedRemittanceAllocation[] = [];
    for (const allocation of data.allocations) {
      const collection = collectionMap.get(allocation.orderId);
      if (!collection) {
        throw new ConflictException(
          `Collection record not found for order ${allocation.orderId}`,
        );
      }
      this.assertAllocationAllowed(
        collection,
        allocation,
        data.mode,
        receivedAt,
      );
      validated.push({ collection, allocation });
    }
    return validated;
  }

  private assertAllocationAllowed(
    row: CodCollection,
    allocation: RemittanceAllocationInput,
    mode: ReconciliationMode,
    receivedAt: Date,
  ): void {
    if (row.mode !== mode)
      throw new ConflictException('Cannot mix reconciliation mode');
    if (receivedAt < row.collectedAt)
      throw new ConflictException('Receipt precedes collection');
    if (row.feeDeducted + allocation.feeDeducted > row.approvedCarrierFee)
      throw new ConflictException('Carrier fee deduction exceeds approved fee');
    const grossAlreadyReceived = row.cashReceived + row.feeDeducted;
    const allocatedGrossAmount = allocation.cashAmount + allocation.feeDeducted;
    if (grossAlreadyReceived + allocatedGrossAmount > row.collectedAmount)
      throw new ConflictException('Receipt exceeds verified collection');
  }

  private async saveRemittance(
    manager: EntityManager,
    adminId: string,
    data: RemittanceInput,
    receivedAt: Date,
  ) {
    try {
      return await manager.save(
        CodRemittance,
        manager.create(CodRemittance, {
          mode: data.mode,
          reference: data.reference,
          netAmount: data.netAmount,
          receivedAt,
          reason: data.reason,
          evidence: data.evidence,
          actorId: adminId,
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Remittance reference already recorded');
      }
      throw error;
    }
  }

  private async applyAllocations(
    manager: EntityManager,
    batch: CodRemittance,
    validated: ValidatedRemittanceAllocation[],
    now: Date,
    adminId: string,
  ): Promise<CodRemittanceAllocation[]> {
    const savedAllocations: CodRemittanceAllocation[] = [];
    for (const { collection, allocation } of validated) {
      const saved = await manager.save(
        CodRemittanceAllocation,
        manager.create(CodRemittanceAllocation, {
          remittanceId: batch.id,
          collectionId: collection.id,
          orderId: collection.orderId,
          cashAmount: allocation.cashAmount,
          feeDeducted: allocation.feeDeducted,
        }),
      );
      savedAllocations.push(saved);
      collection.cashReceived += allocation.cashAmount;
      collection.feeDeducted += allocation.feeDeducted;
      await this.updateProjection(manager, collection, now, adminId);
    }
    return savedAllocations.sort((a, b) => a.orderId.localeCompare(b.orderId));
  }

  private async markFundedHeld(
    manager: EntityManager,
    row: CodCollection,
    now: Date,
    adminId: string,
  ): Promise<void> {
    let entry = await manager.findOneBy(ShopLedgerEntry, {
      orderId: row.orderId,
      type: Not(SHOP_LEDGER_ENTRY_TYPE.COD_SHIPPING_DEBIT),
    });
    if (!entry) {
      entry = await manager.save(
        ShopLedgerEntry,
        manager.create(ShopLedgerEntry, {
          shopId: row.shopId,
          orderId: row.orderId,
          collectionId: row.id,
          mode: row.mode,
          type: SHOP_LEDGER_TYPE.COD_FUNDED_HELD,
          amount: row.sellerNet,
          actorId: adminId,
          createdAt: now,
        }),
      );
    }
    const isMatchingCredit =
      entry.collectionId === row.id &&
      entry.shopId === row.shopId &&
      entry.mode === row.mode &&
      entry.amount === row.sellerNet;
    if (!isMatchingCredit)
      throw new ConflictException('Shop subledger requires reconciliation');
    row.status = COD_RECONCILIATION_STATUS.FUNDED_HELD;
    row.fundedAt ??= entry.createdAt;
  }
}
