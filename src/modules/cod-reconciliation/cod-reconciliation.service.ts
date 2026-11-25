import { createHash } from 'node:crypto';

import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import { CoinService } from '@/modules/coins/core/coin.service';
import { ORDER_PAYMENT_METHOD } from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';

import { RECONCILIATION_REVIEW_REASON } from './constants/cod-reconciliation.constant';
import {
  COD_RECONCILIATION_STATUS,
  SHOP_LEDGER_TYPE,
} from './constants/cod-reconciliation.constant';
import {
  CodCollection,
  CodRemittance,
  CodRemittanceAllocation,
} from './entities';
import { requiresFulfillmentReview } from './policies/cod-funding.policy';
import { reconciliationMoney } from './policies/cod-reconciliation-money.policy';
import { orderFundingFingerprint } from './policies/order-fingerprint.policy';
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
  remittanceInputSchema,
} from './schemas/cod-reconciliation.schema';

const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

@Injectable()
export class CodReconciliationService {
  constructor(private readonly db: DataSource) {}

  private async lock(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
  }
  private async now(manager: EntityManager) {
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }
  private orderFingerprint(order: Order, shipment: Shipment) {
    return orderFundingFingerprint(order, shipment);
  }

  async recordCollection(
    adminId: string,
    orderId: string,
    input: CollectionInput,
  ) {
    const data = collectionInputSchema.parse(input);
    const requestFingerprint = fingerprint({ orderId, ...data });
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      const existing = await this.findCollectionReplay(
        manager,
        orderId,
        data.requestId,
        requestFingerprint,
      );
      if (existing) return existing;
      const context = await this.loadCollectionContext(manager, orderId, data);
      return this.createCollection(
        manager,
        adminId,
        context,
        data,
        requestFingerprint,
      );
    });
  }

  async recordRemittance(adminId: string, input: RemittanceInput) {
    const data = remittanceInputSchema.parse(input);
    const requestFingerprint = fingerprint(data);
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      const existing = await this.findRemittanceReplay(
        manager,
        data,
        requestFingerprint,
      );
      if (existing) return this.remittanceView(manager, existing);
      const now = await this.now(manager);
      const receivedAt = new Date(data.receivedAt);
      const isFutureReceipt = receivedAt > now;
      if (isFutureReceipt) throw new ConflictException('Invalid receipt time');
      const allocations = await this.loadValidatedAllocations(
        manager,
        data,
        receivedAt,
      );
      const batch = await this.saveRemittance(
        manager,
        adminId,
        data,
        receivedAt,
        requestFingerprint,
      );
      await this.applyAllocations(manager, batch, allocations, now, adminId);
      return this.remittanceView(manager, batch);
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
    const hasReviewReason = Boolean(row.reviewReason);
    const grossReceived = row.cashReceived + row.feeDeducted;
    const isFullyReceived = grossReceived === row.expectedAmount;
    if (hasReviewReason) row.status = COD_RECONCILIATION_STATUS.REVIEW;
    else if (isFullyReceived)
      await this.markFundedHeld(manager, row, now, adminId);
    else {
      const hasPartialReceipt = grossReceived > 0;
      row.status = hasPartialReceipt
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
    const hasShortCollection = row.collectedAmount < row.expectedAmount;
    if (hasShortCollection)
      return RECONCILIATION_REVIEW_REASON.SHORT_COLLECTION;
    const hasExcessCollection = row.collectedAmount > row.expectedAmount;
    if (hasExcessCollection)
      return RECONCILIATION_REVIEW_REASON.EXCESS_COLLECTION;
    const hasChangedSnapshot =
      this.orderFingerprint(order, shipment) !== row.orderFingerprint;
    if (hasChangedSnapshot)
      return RECONCILIATION_REVIEW_REASON.ORDER_SNAPSHOT_CHANGED;
    const needsFulfillmentReview = requiresFulfillmentReview(
      order,
      shipment,
      now,
    );
    if (needsFulfillmentReview)
      return RECONCILIATION_REVIEW_REASON.CARRIER_OR_ORDER_REQUIRES_REVIEW;
    return null;
  }

  async refresh(adminId: string, orderId: string) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      const row = await manager.findOneByOrFail(CodCollection, { orderId });
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
  private async remittanceView(manager: EntityManager, row: CodRemittance) {
    return {
      ...row,
      allocations: await manager.find(CodRemittanceAllocation, {
        where: { remittanceId: row.id },
        order: { orderId: 'ASC' },
      }),
    };
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
    const remittances = allocations.length
      ? await manager.find(CodRemittance, {
          where: { id: In(allocations.map((row) => row.remittanceId)) },
          order: { receivedAt: 'ASC', id: 'ASC' },
        })
      : [];
    return {
      collection,
      remittances: await Promise.all(
        remittances.map((row) => this.remittanceView(manager, row)),
      ),
    };
  }

  private async findCollectionReplay(
    manager: EntityManager,
    orderId: string,
    requestId: string,
    requestFingerprint: string,
  ) {
    const existing = await manager.findOneBy(CodCollection, [
      { orderId },
      { requestId },
    ]);
    if (!existing) return null;
    const isSameOrder = existing.orderId === orderId;
    const isSamePayload = existing.requestFingerprint === requestFingerprint;
    const isMatchingReplay = isSameOrder && isSamePayload;
    if (!isMatchingReplay)
      throw new ConflictException(
        'Collection already recorded with another request or payload',
      );
    return existing;
  }

  private async loadCollectionContext(
    manager: EntityManager,
    orderId: string,
    data: CollectionInput,
  ): Promise<CollectionContext> {
    const order = await manager.findOneByOrFail(Order, {
      id: orderId,
      paymentMethod: ORDER_PAYMENT_METHOD.COD,
    });
    const shipment = await manager.findOneByOrFail(Shipment, { orderId });
    const hasMatchingWaybill =
      Boolean(shipment.orderCode) && shipment.orderCode === data.waybillCode;
    const hasMatchingAmount = shipment.codAmount === order.total;
    const isMatchingShipment = hasMatchingWaybill && hasMatchingAmount;
    if (!isMatchingShipment)
      throw new ConflictException('COD waybill and expected amount must match');
    return { order, shipment };
  }

  private async createCollection(
    manager: EntityManager,
    adminId: string,
    context: CollectionContext,
    data: CollectionInput,
    requestFingerprint: string,
  ) {
    const { order, shipment } = context;
    const now = await this.now(manager);
    const collectedAt = new Date(data.collectedAt);
    const isInvalidCollectionTime =
      collectedAt > now || collectedAt < order.createdAt;
    if (isInvalidCollectionTime)
      throw new ConflictException('Invalid collection time');
    const money = reconciliationMoney(order);
    if (data.collectedAmount === order.total && (order.coinDiscount ?? 0) > 0)
      await new CoinService().consumeOrderCoins(manager, order, data.mode, now);
    const isInvalidExpectedAmount = order.total <= 0;
    if (isInvalidExpectedAmount)
      throw new ConflictException('COD expected amount must be positive');
    const row = await manager.save(
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
        requestFingerprint,
        orderFingerprint: this.orderFingerprint(order, shipment),
        status: COD_RECONCILIATION_STATUS.AWAITING,
        cashReceived: 0,
        feeDeducted: 0,
        reviewReason: null,
        fundedAt: null,
      }),
    );
    await this.updateProjection(manager, row, now, adminId);
    return row;
  }

  private async findRemittanceReplay(
    manager: EntityManager,
    data: RemittanceInput,
    requestFingerprint: string,
  ) {
    const existing = await manager.findOneBy(CodRemittance, [
      { requestId: data.requestId },
      { mode: data.mode, reference: data.reference },
    ]);
    if (!existing) return null;
    const isSamePayload = existing.requestFingerprint === requestFingerprint;
    if (!isSamePayload)
      throw new ConflictException(
        'Remittance already recorded with another request or payload',
      );
    return existing;
  }

  private async loadValidatedAllocations(
    manager: EntityManager,
    data: RemittanceInput,
    receivedAt: Date,
  ): Promise<ValidatedRemittanceAllocation[]> {
    const orderIds = data.allocations.map((a) => a.orderId);
    const collections = await manager.find(CodCollection, {
      where: { orderId: In(orderIds) },
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
    const isDifferentMode = row.mode !== mode;
    if (isDifferentMode)
      throw new ConflictException('Cannot mix reconciliation mode');
    const receiptPrecedesCollection = receivedAt < row.collectedAt;
    if (receiptPrecedesCollection)
      throw new ConflictException('Receipt precedes collection');
    const totalFeeDeducted = row.feeDeducted + allocation.feeDeducted;
    const exceedsApprovedFee = totalFeeDeducted > row.approvedCarrierFee;
    if (exceedsApprovedFee)
      throw new ConflictException('Carrier fee deduction exceeds approved fee');
    const grossAlreadyReceived = row.cashReceived + row.feeDeducted;
    const allocatedGrossAmount = allocation.cashAmount + allocation.feeDeducted;
    const exceedsVerifiedCollection =
      grossAlreadyReceived + allocatedGrossAmount > row.collectedAmount;
    if (exceedsVerifiedCollection)
      throw new ConflictException('Receipt exceeds verified collection');
  }

  private saveRemittance(
    manager: EntityManager,
    adminId: string,
    data: RemittanceInput,
    receivedAt: Date,
    requestFingerprint: string,
  ) {
    return manager.save(
      CodRemittance,
      manager.create(CodRemittance, {
        requestId: data.requestId,
        mode: data.mode,
        reference: data.reference,
        netAmount: data.netAmount,
        receivedAt,
        reason: data.reason,
        evidence: data.evidence,
        actorId: adminId,
        requestFingerprint,
      }),
    );
  }

  private async applyAllocations(
    manager: EntityManager,
    batch: CodRemittance,
    validated: ValidatedRemittanceAllocation[],
    now: Date,
    adminId: string,
  ): Promise<void> {
    for (const { collection, allocation } of validated) {
      await manager.save(
        CodRemittanceAllocation,
        manager.create(CodRemittanceAllocation, {
          remittanceId: batch.id,
          collectionId: collection.id,
          orderId: collection.orderId,
          cashAmount: allocation.cashAmount,
          feeDeducted: allocation.feeDeducted,
        }),
      );
      collection.cashReceived += allocation.cashAmount;
      collection.feeDeducted += allocation.feeDeducted;
      await this.updateProjection(manager, collection, now, adminId);
    }
  }

  private async markFundedHeld(
    manager: EntityManager,
    row: CodCollection,
    now: Date,
    adminId: string,
  ): Promise<void> {
    let entry = await manager.findOneBy(ShopLedgerEntry, {
      orderId: row.orderId,
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
    const isMatchingCollection = entry.collectionId === row.id;
    const isMatchingShop = entry.shopId === row.shopId;
    const isMatchingMode = entry.mode === row.mode;
    const isMatchingAmount = entry.amount === row.sellerNet;
    const isMatchingCredit =
      isMatchingCollection &&
      isMatchingShop &&
      isMatchingMode &&
      isMatchingAmount;
    if (!isMatchingCredit)
      throw new ConflictException('Shop subledger requires reconciliation');
    row.status = COD_RECONCILIATION_STATUS.FUNDED_HELD;
    row.fundedAt ??= entry.createdAt;
  }
}
