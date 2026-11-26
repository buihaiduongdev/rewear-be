import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { DisputeAppeal } from './dispute-appeal.entity';
import { DisputeEvidence } from './dispute-evidence.entity';

@Entity('dispute_appeal_evidence')
@Index(['appealId', 'evidenceId'], { unique: true })
export class DisputeAppealEvidence extends BaseEntity {
  @Column('uuid')
  appealId: string;

  @ManyToOne(() => DisputeAppeal, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'appealId' })
  appeal: DisputeAppeal;

  @Column('uuid')
  evidenceId: string;

  @ManyToOne(() => DisputeEvidence, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'evidenceId' })
  evidence: DisputeEvidence;
}
