import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Order } from '@/modules/order/order.entity';

import type { HandoverState } from './late-handover.constants';

@Entity('fulfillment_calendars')
export class FulfillmentCalendar {
  @PrimaryColumn('integer')
  year: number;

  @Column('jsonb')
  closedDates: string[];

  @Column('text')
  source: string;

  @Column('uuid')
  approvedBy: string;
}

export interface HandoverAudit {
  action: string;
  actorId: string | null;
  at: string;
  reason: string;
  evidence?: string;
}

@Entity('fulfillment_notices')
@Index(['orderId', 'recipientId', 'action'], { unique: true })
@Index(['recipientId', 'createdAt'])
export class FulfillmentNotice extends BaseEntity {
  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column('uuid')
  recipientId: string;

  @Column({ type: 'varchar', length: 40 })
  action: string;

  @Column('text')
  reason: string;
}

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
