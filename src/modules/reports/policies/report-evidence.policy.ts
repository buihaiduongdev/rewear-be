import { BadRequestException } from '@nestjs/common';

import { type EntityManager, In } from 'typeorm';

import { REPORT_POLICY } from '../constants/report.constant';
import {
  ReportEvidence,
  type ViolationReport,
} from '../entities/report.entity';
import type { CreateReportInput } from '../types/report.type';
import { reportTargetSnapshot } from './report-target.policy';

export async function reportSubmissionTarget(
  manager: EntityManager,
  userId: string,
  input: CreateReportInput,
) {
  if (!input.evidenceIds.length)
    return reportTargetSnapshot(
      manager,
      userId,
      input.targetType,
      input.targetId,
    );
  const evidence = await manager.findBy(ReportEvidence, {
    id: In(input.evidenceIds),
  });
  const valid =
    evidence.length === input.evidenceIds.length &&
    evidence.every(
      (item) =>
        item.uploadedById === userId &&
        item.targetType === input.targetType &&
        item.targetId === input.targetId &&
        item.reportId === null,
    );
  if (!valid)
    throw new BadRequestException(
      'Report evidence must belong to the reporter and match the target',
    );
  return evidence[0].target;
}

export async function attachReportEvidence(
  manager: EntityManager,
  row: ViolationReport,
  ids: string[],
) {
  const evidence = ids.length
    ? await manager.findBy(ReportEvidence, { id: In(ids) })
    : [];
  const invalidEvidence =
    evidence.length !== ids.length ||
    evidence.some(
      (item) =>
        item.uploadedById !== row.reporterId ||
        item.targetType !== row.targetType ||
        item.targetId !== row.targetId ||
        (item.reportId !== null && item.reportId !== row.id),
    );
  if (invalidEvidence)
    throw new BadRequestException(
      'Report evidence must belong to the reporter and match the target',
    );
  const newEvidence = evidence.filter((item) => item.reportId === null);
  const count = await manager.countBy(ReportEvidence, { reportId: row.id });
  if (count + newEvidence.length > REPORT_POLICY.MAX_EVIDENCE)
    throw new BadRequestException('Report evidence limit reached');
  for (const item of newEvidence) {
    item.reportId = row.id;
    await manager.save(item);
  }
}
