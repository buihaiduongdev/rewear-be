import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { REPORT_ACTION, REPORT_STATUS } from './constants/report.constant';
import { ViolationReport } from './entities/report.entity';
import {
  attachReportEvidence,
  reportSubmissionTarget,
} from './policies/report-evidence.policy';
import {
  reportClock,
  reportFingerprint,
  reportReplay,
  saveReportCommand,
} from './policies/report-transaction.policy';
import { ReportReadService } from './report-read.service';
import { ReportAccess } from './report.access';
import { recordReportAction } from './report.lifecycle';
import {
  createReportSchema,
  reportSupplementSchema,
} from './schemas/report.schema';
import type {
  CreateReportInput,
  ReportSupplementInput,
} from './types/report.type';

@Injectable()
export class ViolationReportService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ReportAccess,
    private readonly read: ReportReadService,
  ) {}
  create(userId: string, input: CreateReportInput) {
    const data = createReportSchema.parse(input);
    const fingerprint = reportFingerprint(data);
    return this.db.transaction(async (manager) => {
      await reportClock(manager);
      await this.access.active(manager, userId);
      const existing = await manager.findOneBy(ViolationReport, {
        reporterId: userId,
        requestId: data.requestId,
      });
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new ConflictException('Report request payload changed');
        return this.read.view(manager, existing);
      }
      const target = await reportSubmissionTarget(manager, userId, data);
      const row = await manager.save(
        ViolationReport,
        manager.create(ViolationReport, {
          reporterId: userId,
          requestId: data.requestId,
          fingerprint,
          targetType: data.targetType,
          targetId: data.targetId,
          target,
          reason: data.reason,
          description: data.description,
          status: REPORT_STATUS.OPEN,
          version: 1,
          assignedAdminId: null,
          outcome: null,
          measure: null,
          resolutionReason: null,
          adminNote: null,
          resolvedAt: null,
        }),
      );
      await attachReportEvidence(manager, row, data.evidenceIds);
      await recordReportAction(manager, row, userId, REPORT_ACTION.SUBMITTED);
      return this.read.view(manager, row);
    });
  }
  supplement(userId: string, id: string, input: ReportSupplementInput) {
    const data = reportSupplementSchema.parse(input);
    const fingerprint = reportFingerprint({
      id,
      action: REPORT_ACTION.SUPPLEMENTED,
      data,
    });
    return this.db.transaction(async (manager) => {
      await reportClock(manager);
      const row = await this.access.own(manager, userId, id, true);
      if (await reportReplay(manager, userId, data.requestId, id, fingerprint))
        return this.read.view(manager, row);
      if (row.status === REPORT_STATUS.RESOLVED)
        throw new ConflictException(
          'Closed reports cannot receive supplements',
        );
      await attachReportEvidence(manager, row, data.evidenceIds);
      row.version++;
      await manager.save(row);
      await saveReportCommand(manager, userId, data.requestId, id, fingerprint);
      await recordReportAction(
        manager,
        row,
        userId,
        REPORT_ACTION.SUPPLEMENTED,
        data.text,
      );
      return this.read.view(manager, row);
    });
  }
}
