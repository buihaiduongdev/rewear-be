import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { Order } from '@/modules/order/entities';

import type {
  RefundBlock,
  RefundState,
} from '../schemas/refund-execution.schema';
import { DisputeFinalDecision } from './dispute-final-decision.entity';

@Entity('dispute_refunds')
@Index(['finalDecisionId'], { unique: true })
@Index(['status', 'id'])
@Index(['orderId'])
export class DisputeRefund extends BaseEntity {
  @Column({ type: 'integer', nullable: true })
  executionAmount: number | null;

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
