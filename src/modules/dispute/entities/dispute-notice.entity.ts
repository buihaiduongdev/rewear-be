import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type {
  DisputeAction,
  DisputeNoticeAudience,
} from '../schemas/dispute.schema';
import { DisputeIssue } from './dispute-issue.entity';

@Entity('dispute_notices')
@Index(['issueId', 'action', 'audience', 'eventKey'], { unique: true })
export class DisputeNotice extends BaseEntity {
  @Column({ type: 'varchar', length: 64, default: 'INITIAL' })
  eventKey: string;

  @Column('uuid')
  issueId: string;

  @ManyToOne(() => DisputeIssue, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'issueId' })
  issue: DisputeIssue;

  @Column({ type: 'varchar', length: 24 })
  action: DisputeAction;

  @Column({ type: 'varchar', length: 16 })
  audience: DisputeNoticeAudience;

  @Column('text')
  reason: string;
}
