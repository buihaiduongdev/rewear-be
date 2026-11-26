import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { ReportAction, ReportStatus } from '../schemas/report.schema';
import { ViolationReport } from './violation-report.entity';

@Entity('violation_report_audits')
@Index(['reportId', 'version'], { unique: true })
export class ReportAudit extends BaseEntity {
  @Column('uuid')
  reportId: string;
  @ManyToOne(() => ViolationReport, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reportId' })
  report: ViolationReport;
  @Column('uuid')
  actorId: string;
  @Column('varchar', { length: 32 })
  action: ReportAction;
  @Column('integer')
  version: number;
  @Column('varchar', { length: 16 })
  status: ReportStatus;
  @Column('text', { nullable: true })
  publicReason: string | null;
  @Column('text', { nullable: true })
  adminNote: string | null;
  @Column('jsonb', { nullable: true })
  effect: Record<string, unknown> | null;
}
