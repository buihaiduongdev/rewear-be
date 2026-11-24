import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Media } from '@/modules/media/entities';
import { User } from '@/modules/user/entities';

import type {
  ReportAction,
  ReportMeasure,
  ReportOutcome,
  ReportReason,
  ReportStatus,
  ReportTargetSnapshot,
  ReportTargetType,
} from '../types/report.type';

@Entity('violation_reports')
@Index(['reporterId', 'requestId'], { unique: true })
@Index(['status', 'createdAt', 'id'])
@Index(['reporterId', 'createdAt', 'id'])
export class ViolationReport extends BaseEntity {
  @Column('uuid')
  reporterId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reporterId' })
  reporter: User;
  @Column('uuid')
  requestId: string;
  @Column('varchar', { length: 64 })
  fingerprint: string;
  @Column('varchar', { length: 16 })
  targetType: ReportTargetType;
  @Column('uuid')
  targetId: string;
  @Column('jsonb')
  target: ReportTargetSnapshot;
  @Column('varchar', { length: 32 })
  reason: ReportReason;
  @Column('text')
  description: string;
  @Column('varchar', { length: 16 })
  status: ReportStatus;
  @Column('integer', { default: 1 })
  version: number;
  @Column('uuid', { nullable: true })
  assignedAdminId: string | null;
  @Column('varchar', { length: 16, nullable: true })
  outcome: ReportOutcome | null;
  @Column('varchar', { length: 32, nullable: true })
  measure: ReportMeasure | null;
  @Column('text', { nullable: true })
  resolutionReason: string | null;
  @Column('text', { nullable: true })
  adminNote: string | null;
  @Column('timestamptz', { nullable: true })
  resolvedAt: Date | null;
}

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

@Entity('violation_report_commands')
@Index(['actorId', 'requestId'], { unique: true })
export class ReportCommand extends BaseEntity {
  @Column('uuid')
  actorId: string;
  @Column('uuid')
  requestId: string;
  @Column('uuid')
  reportId: string;
  @ManyToOne(() => ViolationReport, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reportId' })
  report: ViolationReport;
  @Column('varchar', { length: 64 })
  fingerprint: string;
}
