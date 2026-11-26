import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '@/infrastructure/storage';
import { MediaModule } from '@/modules/media/media.module';

import {
  ReportAudit,
  ReportCommand,
  ReportEvidence,
  ViolationReport,
} from './entities';
import { ReportMediaService } from './report-media.service';
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
  providers: [ViolationReportService, ReportMediaService],
})
export class ReportModule {}
