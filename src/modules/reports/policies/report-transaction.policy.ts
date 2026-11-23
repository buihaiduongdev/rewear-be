import { createHash } from 'node:crypto';

import { ConflictException } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import { ReportCommand } from '../entities/report.entity';

export const reportFingerprint = (input: unknown) =>
  createHash('sha256').update(JSON.stringify(input)).digest('hex');
export async function reportClock(manager: EntityManager) {
  await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
  const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
  return new Date(now);
}
export async function reportReplay(
  manager: EntityManager,
  actorId: string,
  requestId: string,
  reportId: string,
  fingerprint: string,
) {
  const prior = await manager.findOneBy(ReportCommand, { actorId, requestId });
  if (
    prior &&
    (prior.reportId !== reportId || prior.fingerprint !== fingerprint)
  )
    throw new ConflictException('Report command payload changed');
  return !!prior;
}
export async function saveReportCommand(
  manager: EntityManager,
  actorId: string,
  requestId: string,
  reportId: string,
  fingerprint: string,
) {
  await manager.save(
    ReportCommand,
    manager.create(ReportCommand, {
      actorId,
      requestId,
      reportId,
      fingerprint,
    }),
  );
}
