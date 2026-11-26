import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Order } from '@/modules/order/entities';

import type {
  HandoverAudit,
  HandoverState,
} from '../schemas/late-handover.schema';

export type { HandoverAudit } from '../schemas/late-handover.schema';

@Entity('handover_cases')
@Index(['orderId'], { unique: true })
@Index(['state', 'reviewDueAt'])
export class HandoverCase extends BaseEntity {
  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'varchar', length: 24 })
  state: HandoverState;

  @Column('timestamptz')
  detectedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  reviewDueAt: Date | null;

  @Column({ default: false })
  calendarMissing: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  proposedDeadline: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  respondBy: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  consentedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'jsonb', default: [] })
  events: HandoverAudit[];
}
