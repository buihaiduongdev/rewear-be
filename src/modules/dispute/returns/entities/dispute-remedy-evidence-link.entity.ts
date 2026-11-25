import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { DisputeEvidence } from '../../entities/dispute-evidence.entity';

@Entity('dispute_remedy_evidence_links')
@Index(['recordId', 'evidenceId'], { unique: true })
export class DisputeRemedyEvidenceLink extends BaseEntity {
  @Column('uuid')
  recordId: string;

  @Column('uuid')
  orderId: string;

  @Column('uuid')
  evidenceId: string;

  @ManyToOne(() => DisputeEvidence, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'evidenceId' })
  evidence: DisputeEvidence;
}
