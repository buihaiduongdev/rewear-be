import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import type { ReturnState } from '../schemas/dispute.schema';
import { DisputeDecision } from './dispute-decision.entity';

@Entity('dispute_returns')
@Index(['decisionId'], { unique: true })
@Index(['orderId'])
export class DisputeReturn extends BaseEntity {
  @Column('uuid')
  decisionId: string;

  @ManyToOne(() => DisputeDecision, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'decisionId' })
  decision: DisputeDecision;

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

  @Column({ type: 'timestamptz', nullable: true })
  handoverBy: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  handoverAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  readyAt: Date | null;
}
