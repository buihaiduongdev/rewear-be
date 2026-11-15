import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationReviewReason } from '@/modules/cod-reconciliation/cod-reconciliation.type';
import { Order } from '@/modules/order/order.entity';
import { Shipment } from '@/modules/shipment/shipment.entity';
import { Shop } from '@/modules/shop/entities';

import type {
  CodReconciliationStatus,
  ReconciliationMode,
} from './cod-reconciliation.type';

@Entity('cod_collections')
@Index(['orderId'], { unique: true })
@Index(['requestId'], { unique: true })
@Index(['shopId', 'mode', 'status'])
@Check(
  'CHK_cod_collection_money',
  '"collectedAmount" >= 0 AND "approvedCarrierFee" >= 0 AND "cashReceived" >= 0 AND "feeDeducted" >= 0 AND "cashReceived"::bigint + "feeDeducted" <= "collectedAmount" AND "feeDeducted" <= "approvedCarrierFee" AND "gross" >= "commission" AND "commission" >= 0 AND "sellerNet" = "gross" - "commission"',
)
export class CodCollection extends BaseEntity {
  @Column('uuid')
  orderId: string;
  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;
  @Column('uuid')
  shopId: string;
  @ManyToOne(() => Shop, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shopId' })
  shop: Shop;
  @Column('uuid')
  shipmentId: string;
  @ManyToOne(() => Shipment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shipmentId' })
  shipment: Shipment;
  @Column('uuid')
  requestId: string;
  @Column('uuid')
  actorId: string;
  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;
  @Column({ type: 'varchar', length: 24 })
  status: CodReconciliationStatus;
  @Column({ type: 'varchar', length: 50 })
  waybillCode: string;
  @Column('integer')
  expectedAmount: number;
  @Column('integer')
  collectedAmount: number;
  @Column('integer')
  approvedCarrierFee: number;
  @Column('integer')
  gross: number;
  @Column('integer')
  commission: number;
  @Column('integer')
  sellerNet: number;
  @Column({ type: 'integer', default: 0 })
  cashReceived: number;
  @Column({ type: 'integer', default: 0 })
  feeDeducted: number;
  @Column('timestamptz')
  collectedAt: Date;
  @Column('text')
  reason: string;
  @Column('text')
  evidence: string;
  @Column({ type: 'varchar', length: 64 })
  requestFingerprint: string;
  @Column({ type: 'varchar', length: 64 })
  orderFingerprint: string;
  @Column({ type: 'text', nullable: true })
  reviewReason: ReconciliationReviewReason | null;
  @Column({ type: 'timestamptz', nullable: true })
  fundedAt: Date | null;
}

@Entity('cod_remittances')
@Index(['requestId'], { unique: true })
@Index(['mode', 'reference'], { unique: true })
@Check('CHK_cod_remittance_nonnegative', '"netAmount" >= 0')
export class CodRemittance extends BaseEntity {
  @Column('uuid')
  requestId: string;
  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;
  @Column({ type: 'varchar', length: 120 })
  reference: string;
  @Column('integer')
  netAmount: number;
  @Column('timestamptz')
  receivedAt: Date;
  @Column('uuid')
  actorId: string;
  @Column('text')
  reason: string;
  @Column('text')
  evidence: string;
  @Column({ type: 'varchar', length: 64 })
  requestFingerprint: string;
}

@Entity('cod_remittance_allocations')
@Index(['remittanceId', 'orderId'], { unique: true })
@Index(['collectionId', 'createdAt'])
@Check(
  'CHK_cod_allocation_value',
  '"cashAmount" >= 0 AND "feeDeducted" >= 0 AND "cashAmount"::bigint + "feeDeducted" > 0',
)
export class CodRemittanceAllocation extends BaseEntity {
  @Column('uuid')
  remittanceId: string;
  @ManyToOne(() => CodRemittance, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'remittanceId' })
  remittance: CodRemittance;
  @Column('uuid')
  collectionId: string;
  @ManyToOne(() => CodCollection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'collectionId' })
  collection: CodCollection;
  @Column('uuid')
  orderId: string;
  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;
  @Column('integer')
  cashAmount: number;
  @Column('integer')
  feeDeducted: number;
}
