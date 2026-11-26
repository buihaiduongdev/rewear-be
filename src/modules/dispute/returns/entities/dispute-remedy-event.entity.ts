import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('dispute_remedy_events')
@Index(['requestId'], { unique: true })
export class DisputeRemedyEvent extends BaseEntity {
  @Column('uuid')
  requestId: string;

  @Column('uuid')
  finalDecisionId: string;

  @Column('uuid')
  actorId: string;

  @Column({ length: 64 })
  action: string;

  @Column({ length: 64 })
  fingerprint: string;

  @Column({ type: 'uuid', nullable: true })
  recordId: string | null;
}
