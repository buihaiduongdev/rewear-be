import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Media } from '@/modules/media/entities';

import { ViolationReport } from './violation-report.entity';

@Entity('violation_report_evidence')
@Index(['reportId'])
export class ReportEvidence extends BaseEntity {
  @Column('uuid')
  reportId: string;
  @ManyToOne(() => ViolationReport, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reportId' })
  report: ViolationReport;
  @Column('uuid', { unique: true })
  mediaId: string;
  @ManyToOne(() => Media, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'mediaId' })
  media: Media;
}
