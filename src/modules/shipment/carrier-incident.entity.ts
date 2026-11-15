import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { Shipment } from './shipment.entity';

export interface CarrierIncidentAudit {
  outcome: 'CANCELLED_BEFORE_PICKUP' | 'KEEP_REVIEW';
  actorId: string;
  at: string;
  reason: string;
  evidence: string;
}

@Entity('carrier_incidents')
@Index(['shipmentId'], { unique: true })
export class CarrierIncident extends BaseEntity {
  @Column('uuid')
  shipmentId: string;

  @ManyToOne(() => Shipment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shipmentId' })
  shipment: Shipment;

  @Column({ type: 'varchar', length: 16 })
  state: 'REVIEW' | 'RESOLVED';

  @Column('timestamptz')
  openedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  reviewDueAt: Date | null;

  @Column({ default: false })
  calendarMissing: boolean;

  @Column({ default: false })
  overdue: boolean;

  @Column({ type: 'jsonb', default: [] })
  events: CarrierIncidentAudit[];
}
