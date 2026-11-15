import { createHash } from 'node:crypto';

import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import { GHN_SHIPMENT_STATUS } from '@/infrastructure/shipping/ghn-shipment.constants';
import type { ReconciliationReviewReason } from '@/modules/cod-reconciliation/cod-reconciliation.type';
import {
  ORDER_CANCEL_STATE,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/order.constants';
import { Order } from '@/modules/order/order.entity';
import { SHIPMENT_STATE } from '@/modules/shipment/shipment.constants';
import { UNSAFE_CARRIER_REVIEW_REASONS } from '@/modules/shipment/shipment.constants';
import { Shipment } from '@/modules/shipment/shipment.entity';
import { ShopLedgerEntry } from '@/modules/shop-finance/shop-ledger.entity';

import { RECONCILIATION_REVIEW_REASON } from './cod-reconciliation.constants';
import {
  COD_RECONCILIATION_STATUS,
  SHOP_LEDGER_TYPE,
} from './cod-reconciliation.constants';
import {
  CodCollection,
  CodRemittance,
  CodRemittanceAllocation,
} from './cod-reconciliation.entity';
import { reconciliationMoney } from './cod-reconciliation.money';
import type {
  CollectionInput,
  RemittanceInput,
} from './cod-reconciliation.type';
import type { FinanceListInput } from './cod-reconciliation.type';
import {
  collectionInputSchema,
  remittanceInputSchema,
} from './schemas/cod-reconciliation.schema';

const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const deliveryStates: readonly string[] = [
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.DISPUTE,
  ORDER_STATUS.COMPLETED,
];

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
    return fingerprint({
      shopId: order.shopId,
      method: order.paymentMethod,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      total: order.total,
      rate: order.commissionBasisPoints,
      items: order.items
        .map((item) => ({ productId: item.productId, price: item.price }))
        .sort((a, b) => a.productId.localeCompare(b.productId)),
      shipmentId: shipment.id,
      waybill: shipment.orderCode,
      codAmount: shipment.codAmount,
    });
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
      const existing = await manager.findOneBy(CodCollection, [
        { orderId },
        { requestId: data.requestId },
      ]);
      if (existing) {
        if (
          existing.orderId !== orderId ||
          existing.requestFingerprint !== requestFingerprint
        )
          throw new ConflictException(
            'Collection already recorded with another request or payload',
          );
        return existing;
      }
      const order = await manager.findOneByOrFail(Order, {
        id: orderId,
        paymentMethod: ORDER_PAYMENT_METHOD.COD,
      });
      const shipment = await manager.findOneByOrFail(Shipment, { orderId });
      if (
        !shipment.orderCode ||
        shipment.orderCode !== data.waybillCode ||
        shipment.codAmount !== order.total
      )
        throw new ConflictException(
          'COD waybill and expected amount must match',
        );
      const now = await this.now(manager);
      const collectedAt = new Date(data.collectedAt);
      if (collectedAt > now || collectedAt < order.createdAt)
        throw new ConflictException('Invalid collection time');
      const money = reconciliationMoney(order);
      if (order.total <= 0)
        throw new ConflictException('COD expected amount must be positive');
      const row = await manager.save(
        CodCollection,
        manager.create(CodCollection, {
          ...data,
          orderId,
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
    });
  }

  async recordRemittance(adminId: string, input: RemittanceInput) {
    const data = remittanceInputSchema.parse(input);
    const requestFingerprint = fingerprint(data);
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      const existing = await manager.findOneBy(CodRemittance, [
        { requestId: data.requestId },
        { mode: data.mode, reference: data.reference },
      ]);
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint)
          throw new ConflictException(
            'Remittance already recorded with another request or payload',
          );
        return this.remittanceView(manager, existing);
      }
      const now = await this.now(manager);
      const receivedAt = new Date(data.receivedAt);
      if (receivedAt > now) throw new ConflictException('Invalid receipt time');
      const rows: CodCollection[] = [];
      for (const allocation of data.allocations) {
        const row = await manager.findOneByOrFail(CodCollection, {
          orderId: allocation.orderId,
        });
        if (row.mode !== data.mode)
          throw new ConflictException('Cannot mix reconciliation mode');
        if (receivedAt < row.collectedAt)
          throw new ConflictException('Receipt precedes collection');
        if (row.feeDeducted + allocation.feeDeducted > row.approvedCarrierFee)
          throw new ConflictException(
            'Carrier fee deduction exceeds approved fee',
          );
        if (
          row.cashReceived +
            row.feeDeducted +
            allocation.cashAmount +
            allocation.feeDeducted >
          row.collectedAmount
        )
          throw new ConflictException('Receipt exceeds verified collection');
        rows.push(row);
      }
      const batch = await manager.save(
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
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index],
          allocation = data.allocations[index];
        await manager.save(
          CodRemittanceAllocation,
          manager.create(CodRemittanceAllocation, {
            remittanceId: batch.id,
            collectionId: row.id,
            orderId: row.orderId,
            cashAmount: allocation.cashAmount,
            feeDeducted: allocation.feeDeducted,
          }),
        );
        row.cashReceived += allocation.cashAmount;
        row.feeDeducted += allocation.feeDeducted;
        await this.updateProjection(manager, row, now, adminId);
      }
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
    if (row.reviewReason) row.status = COD_RECONCILIATION_STATUS.REVIEW;
    else if (row.cashReceived + row.feeDeducted === row.expectedAmount) {
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
      if (
        entry.collectionId !== row.id ||
        entry.shopId !== row.shopId ||
        entry.mode !== row.mode ||
        entry.amount !== row.sellerNet
      )
        throw new ConflictException('Shop subledger requires reconciliation');
      row.status = COD_RECONCILIATION_STATUS.FUNDED_HELD;
      row.fundedAt ??= entry.createdAt;
    } else
      row.status =
        row.cashReceived + row.feeDeducted > 0
          ? COD_RECONCILIATION_STATUS.PARTIAL
          : COD_RECONCILIATION_STATUS.AWAITING;
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
    if (this.orderFingerprint(order, shipment) !== row.orderFingerprint)
      return RECONCILIATION_REVIEW_REASON.ORDER_SNAPSHOT_CHANGED;
    const unresolvedCancellation =
      order.cancelState === ORDER_CANCEL_STATE.REJECTED
        ? !order.cancelReviewUntil || order.cancelReviewUntil > now
        : !!order.cancelState;
    if (
      !deliveryStates.includes(order.status) ||
      !order.deliveryObservedAt ||
      shipment.providerStatus !== GHN_SHIPMENT_STATUS.DELIVERED ||
      shipment.state === SHIPMENT_STATE.CANCELLED ||
      shipment.returnRequestedAt ||
      order.carrierReturnedAt ||
      unresolvedCancellation ||
      order.handoverReviewRequired ||
      (shipment.reviewReason &&
        UNSAFE_CARRIER_REVIEW_REASONS.includes(shipment.reviewReason))
    )
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
    return this.db.transaction('REPEATABLE READ', async (manager) => {
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
    });
  }
}
