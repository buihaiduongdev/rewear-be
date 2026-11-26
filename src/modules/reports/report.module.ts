import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '@/infrastructure/storage';
import { MediaModule } from '@/modules/media/media.module';

import { ReportEvidence, ViolationReport } from './entities';
import { ReportController } from './report.controller';
import { ViolationReportService } from './violation-report.service';

@Module({
  imports: [
    StorageModule,
    MediaModule,
    TypeOrmModule.forFeature([ViolationReport, ReportEvidence]),
  ],
  controllers: [ReportController],
  providers: [ViolationReportService],
})
export class ReportModule {}
