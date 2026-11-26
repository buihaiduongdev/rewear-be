import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { User } from '@/modules/user/entities';

import type {
  ReportMeasure,
  ReportOutcome,
  ReportReason,
  ReportStatus,
  ReportTargetSnapshot,
  ReportTargetType,
} from '../schemas/report.schema';

@Entity('violation_reports')
@Index(['status', 'createdAt', 'id'])
@Index(['reporterId', 'createdAt', 'id'])
export class ViolationReport extends BaseEntity {
  @Column('uuid')
  reporterId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reporterId' })
  reporter: User;
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
