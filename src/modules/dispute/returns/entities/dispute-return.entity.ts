import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import { DisputeFinalDecision } from '../../entities/dispute-final-decision.entity';
import type { ReturnState } from '../schemas/return.schema';

@Entity('dispute_returns')
@Index(['remedyKey'], { unique: true })
export class DisputeReturn extends BaseEntity {
  @Column({ default: false })
  labelReplacementRequired: boolean;

  @Column({ default: false })
  timelyHandoverReviewRequired: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  objectionOverdueAt: Date | null;

  @Column({ type: 'varchar', length: 73 })
  remedyKey: string;

  @Column('uuid')
  finalDecisionId: string;

  @Column('uuid')
  orderId: string;

  @Column('uuid')
  productId: string;

  @Column('uuid')
  buyerId: string;

  @Column('uuid')
  shopId: string;

  @Column({ type: 'varchar', length: 24 })
  state: ReturnState;

  @Column({ type: 'varchar', length: 16, nullable: true })
  mode: ReconciliationMode | null;

  @Column({ type: 'text', nullable: true })
  labelCode: string | null;

  @Column({ type: 'text', nullable: true })
  instructions: string | null;

  @Column({ type: 'text', nullable: true })
  readyReason: string | null;

  @Column({ type: 'text', nullable: true })
  obstacleReason: string | null;

  @Column({ type: 'text', nullable: true })
  objectionReason: string | null;

  @Column({ type: 'text', nullable: true })
  extensionReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  labelNotifiedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  handoverBy: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  handoverAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  inspectionDueAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  readyAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  obstacleReportedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  obstacleAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  pausedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  objectionAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  objectionDueAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  extendedAt: Date | null;

  @Column({
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null) => (value === null ? null : Number(value)),
    },
  })
  remainingMs: number | null;

  @Column({ type: 'integer', nullable: true })
  refundLimit: number | null;

  @Column({ default: false })
  packingMissing: boolean;

  @Column({ default: false })
  calendarMissing: boolean;

  @Column({ default: false })
  obstaclePending: boolean;

  @ManyToOne(() => DisputeFinalDecision, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'finalDecisionId' })
  finalDecision: DisputeFinalDecision;
}
