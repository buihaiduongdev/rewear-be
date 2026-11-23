import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';

import {
  ReportAudit,
  ReportCommand,
  ReportEvidence,
  ViolationReport,
} from './entities/report.entity';
import { ReportMediaService } from './media/report-media.service';
import { ReportAdminService } from './report-admin.service';
import { ReportReadService } from './report-read.service';
import { ReportAccess } from './report.access';
import { ReportController } from './report.controller';
import { ViolationReportService } from './violation-report.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ViolationReport,
      ReportEvidence,
      ReportAudit,
      ReportCommand,
    ]),
  ],
  controllers: [ReportController],
  providers: [
    ReportAccess,
    ReportAdminService,
    ReportReadService,
    ViolationReportService,
    ReportMediaService,
    PrivateEvidenceStorage,
  ],
})
export class ReportModule {}
