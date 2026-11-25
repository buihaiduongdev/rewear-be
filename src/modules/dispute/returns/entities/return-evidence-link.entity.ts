import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { DisputeEvidence } from '../../entities/dispute-evidence.entity';
import type { ReturnEvidenceKind } from '../schemas/return.schema';
import { DisputeReturn } from './dispute-return.entity';

@Entity('return_evidence_links')
@Index(['returnId', 'evidenceId', 'kind'], { unique: true })
export class ReturnEvidenceLink extends BaseEntity {
  @Column('uuid')
  returnId: string;

  @ManyToOne(() => DisputeReturn, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'returnId' })
  returnCase: DisputeReturn;

  @Column('uuid')
  evidenceId: string;

  @ManyToOne(() => DisputeEvidence, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'evidenceId' })
  evidence: DisputeEvidence;

  @Column({ type: 'varchar', length: 24 })
  kind: ReturnEvidenceKind;
}
