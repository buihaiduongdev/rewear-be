import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { ViolationReport } from './violation-report.entity';

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
