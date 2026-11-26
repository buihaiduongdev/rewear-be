import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { DisputeParty } from '../schemas/dispute.schema';
import { DisputeIssue } from './dispute-issue.entity';

@Entity('dispute_messages')
@Index(['issueId', 'requestId'], { unique: true })
export class DisputeMessage extends BaseEntity {
  @Column('text')
  text: string;

  @Column('jsonb')
  evidenceIds: string[];

  @Column({ type: 'boolean', nullable: true })
  late: boolean | null;

  @Column('uuid')
  issueId: string;

  @ManyToOne(() => DisputeIssue, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'issueId' })
  issue: DisputeIssue;

  @Column('uuid')
  requestId: string;

  @Column('uuid')
  actorId: string;

  @Column({ type: 'varchar', length: 16 })
  party: DisputeParty;
}
