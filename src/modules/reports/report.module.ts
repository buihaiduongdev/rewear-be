import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '@/infrastructure/storage';
import { MediaModule } from '@/modules/media/media.module';

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
    StorageModule,
    MediaModule,
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
  ],
})
export class ReportModule {}
