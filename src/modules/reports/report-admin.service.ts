import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { REPORT_ACTION, REPORT_STATUS } from './constants/report.constant';
import { applyReportMeasure } from './policies/report-measure.policy';
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
  claimReportSchema,
  resolveReportSchema,
} from './schemas/report.schema';
import type { ClaimReportInput, ResolveReportInput } from './types/report.type';

@Injectable()
export class ReportAdminService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ReportAccess,
    private readonly read: ReportReadService,
  ) {}
  claim(actorId: string, id: string, input: ClaimReportInput) {
    const data = claimReportSchema.parse(input);
    const fingerprint = reportFingerprint({
      id,
      action: REPORT_ACTION.CLAIMED,
      data,
    });
    return this.db.transaction(async (manager) => {
      await reportClock(manager);
      const row = await this.access.adminReport(manager, actorId, id, true);
      if (await reportReplay(manager, actorId, data.requestId, id, fingerprint))
        return this.read.view(manager, row, true);
      if (row.version !== data.expectedVersion)
        throw new ConflictException('Report version changed');
      if (row.status === REPORT_STATUS.RESOLVED)
        throw new ConflictException('Report already resolved');
      if (
        row.status !== REPORT_STATUS.IN_REVIEW ||
        row.assignedAdminId !== actorId
      ) {
        row.status = REPORT_STATUS.IN_REVIEW;
        row.assignedAdminId = actorId;
        row.version++;
        await manager.save(row);
        await recordReportAction(manager, row, actorId, REPORT_ACTION.CLAIMED);
      }
      await saveReportCommand(
        manager,
        actorId,
        data.requestId,
        id,
        fingerprint,
      );
      return this.read.view(manager, row, true);
    });
  }
  resolve(actorId: string, id: string, input: ResolveReportInput) {
    const data = resolveReportSchema.parse(input);
    const fingerprint = reportFingerprint({
      id,
      action: REPORT_ACTION.RESOLVED,
      data,
    });
    return this.db.transaction(async (manager) => {
      const now = await reportClock(manager);
      const row = await this.access.adminReport(manager, actorId, id, true);
      if (await reportReplay(manager, actorId, data.requestId, id, fingerprint))
        return this.read.view(manager, row, true);
      if (row.version !== data.expectedVersion)
        throw new ConflictException('Report version changed');
      if (row.status === REPORT_STATUS.RESOLVED)
        throw new ConflictException('Report already resolved');
      const effect = await applyReportMeasure(manager, row, data);
      row.status = REPORT_STATUS.RESOLVED;
      row.version++;
      row.outcome = data.outcome;
      row.measure = data.action;
      row.resolutionReason = data.reason;
      row.adminNote = data.adminNote;
      row.resolvedAt = now;
      await manager.save(row);
      await saveReportCommand(
        manager,
        actorId,
        data.requestId,
        id,
        fingerprint,
      );
      await recordReportAction(
        manager,
        row,
        actorId,
        REPORT_ACTION.RESOLVED,
        data.reason,
        data.adminNote,
        effect,
      );
      return this.read.view(manager, row, true);
    });
  }
}
