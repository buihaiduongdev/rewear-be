import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { DisputeParty } from '../schemas/dispute.schema';
import { DisputeIssue } from './dispute-issue.entity';

@Entity('dispute_messages')
@Index(['issueId', 'createdAt'])
export class DisputeMessage extends BaseEntity {
  @Column('uuid')
  issueId: string;

  @ManyToOne(() => DisputeIssue, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'issueId' })
  issue: DisputeIssue;

  @Column('uuid')
  actorId: string;

  @Column({ type: 'varchar', length: 16 })
  party: DisputeParty;

  @Column('text')
  text: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  evidenceIds: string[];
}
