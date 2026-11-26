import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { DisputeAction } from '../schemas/dispute.schema';
import { DisputeIssue } from './dispute-issue.entity';

@Entity('dispute_audits')
@Index(['issueId', 'createdAt'])
export class DisputeAudit extends BaseEntity {
  @Column('uuid')
  issueId: string;

  @ManyToOne(() => DisputeIssue, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'issueId' })
  issue: DisputeIssue;

  @Column({ type: 'varchar', length: 24 })
  action: DisputeAction;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;
}
