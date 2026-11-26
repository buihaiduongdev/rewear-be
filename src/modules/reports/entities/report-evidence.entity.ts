import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Media } from '@/modules/media/entities';

import type {
  ReportTargetSnapshot,
  ReportTargetType,
} from '../schemas/report.schema';
import { ViolationReport } from './violation-report.entity';

@Entity('violation_report_evidence')
@Index(['uploadedById', 'createdAt'])
@Index(['reportId'])
export class ReportEvidence extends BaseEntity {
  @Column('jsonb')
  target: ReportTargetSnapshot;
  @Column('uuid')
  uploadedById: string;
  @Column('varchar', { length: 16 })
  targetType: ReportTargetType;
  @Column('uuid')
  targetId: string;
  @Column('uuid', { nullable: true })
  reportId: string | null;
  @ManyToOne(() => ViolationReport, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'reportId' })
  report: ViolationReport | null;
  @Column('uuid', { unique: true })
  mediaId: string;
  @ManyToOne(() => Media, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'mediaId' })
  media: Media;
}
