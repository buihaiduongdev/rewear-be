import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';
import { Order } from '@/modules/order/entities/order.entity';

import type { RefundBlock, RefundState } from '../types/refund-execution.type';
import { DisputeFinalDecision } from './dispute-appeal.entity';

@Entity('dispute_refunds')
@Index(['finalDecisionId'], { unique: true })
@Index(['status', 'id'])
@Index(['orderId'])
export class DisputeRefund extends BaseEntity {
  @Column('uuid')
  finalDecisionId: string;
  @ManyToOne(() => DisputeFinalDecision, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'finalDecisionId' })
  finalDecision: DisputeFinalDecision;
  @Column('uuid')
  orderId: string;
  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;
  @Column('uuid')
  buyerId: string;
  @Column('uuid')
  shopId: string;
  @Column({ type: 'varchar', length: 73 })
  remedyKey: string;
  @Column({ type: 'varchar', length: 16 })
  status: RefundState;
  @Column({ type: 'varchar', length: 32, nullable: true })
  blockedReason: RefundBlock | null;
  @Column({ type: 'varchar', length: 16, nullable: true })
  mode: ReconciliationMode | null;
  @Column({ type: 'timestamptz', nullable: true })
  eligibleAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  dueAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  alertedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  responseDueAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  respondedAt: Date | null;
}

@Entity('dispute_refund_credits')
@Index(['refundId'], { unique: true })
@Index(['remedyKey', 'mode'])
@Index(['shopId', 'mode'])
@Check(
  'CHK_dispute_refund_credit_money',
  '"amount" >= 0 AND "commissionReversed" >= 0 AND "sellerDebit" >= 0 AND "amount" = "commissionReversed" + "sellerDebit" AND "advanceAmount" >= 0 AND "advanceAmount" <= "amount"',
)
export class DisputeRefundCredit extends BaseEntity {
  @Column('uuid')
  refundId: string;
  @ManyToOne(() => DisputeRefund, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'refundId' })
  refund: DisputeRefund;
  @Column('uuid')
  orderId: string;
  @Column('uuid')
  buyerId: string;
  @Column('uuid')
  shopId: string;
  @Column({ type: 'varchar', length: 73 })
  remedyKey: string;
  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;
  @Column('integer')
  amount: number;
  @Column('integer')
  commissionReversed: number;
  @Column('integer')
  sellerDebit: number;
  @Column('integer')
  advanceAmount: number;
}

@Entity('dispute_refund_consents')
@Index(['finalDecisionId', 'party'], { unique: true })
export class DisputeRefundConsent extends BaseEntity {
  @Column('uuid')
  finalDecisionId: string;
  @ManyToOne(() => DisputeFinalDecision, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'finalDecisionId' })
  finalDecision: DisputeFinalDecision;
  @Column('uuid')
  actorId: string;
  @Column({ type: 'varchar', length: 16 })
  party: 'BUYER' | 'SELLER';
  @Column({ type: 'varchar', length: 64 })
  planFingerprint: string;
}

@Entity('dispute_refund_incident_updates')
@Index(['requestId'], { unique: true })
export class DisputeRefundIncidentUpdate extends BaseEntity {
  @Column('uuid')
  refundId: string;
  @ManyToOne(() => DisputeRefund, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'refundId' })
  refund: DisputeRefund;
  @Column('uuid')
  requestId: string;
  @Column('uuid')
  actorId: string;
  @Column({ type: 'varchar', length: 64 })
  requestFingerprint: string;
  @Column('text')
  statusNote: string;
  @Column('text')
  stepsTaken: string;
  @Column('timestamptz')
  nextUpdateAt: Date;
}
