import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { DisputeRefund } from './dispute-refund.entity';

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
