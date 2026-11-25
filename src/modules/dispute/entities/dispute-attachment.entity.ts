import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { DisputeEvidence } from './dispute-evidence.entity';
import { DisputeIssue } from './dispute-issue.entity';

@Entity('dispute_attachments')
@Index(['issueId', 'evidenceId'], { unique: true })
export class DisputeAttachment extends BaseEntity {
  @Column('uuid')
  issueId: string;

  @ManyToOne(() => DisputeIssue, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'issueId' })
  issue: DisputeIssue;

  @Column('uuid')
  evidenceId: string;

  @ManyToOne(() => DisputeEvidence, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'evidenceId' })
  evidence: DisputeEvidence;
}
