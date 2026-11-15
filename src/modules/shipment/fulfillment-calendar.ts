import type { EntityManager } from 'typeorm';

import { VIETNAM_UTC_OFFSET_MS } from '@/common/constants/time.constants';

import { businessDeadline } from './business-calendar';
import { FulfillmentCalendar } from './late-handover.entity';

/** A missing approved year must never turn into an assumed holiday schedule. */
export async function fulfillmentDeadline(
  manager: EntityManager,
  recordedAt: Date,
  days: number,
): Promise<Date | null> {
  const year = new Date(
    recordedAt.getTime() + VIETNAM_UTC_OFFSET_MS,
  ).getUTCFullYear();
  const current = await manager.findOneBy(FulfillmentCalendar, { year });
  if (!current) return null;
  const next = await manager.findOneBy(FulfillmentCalendar, { year: year + 1 });
  const due = businessDeadline(recordedAt, days, [
    ...current.closedDates,
    ...(next?.closedDates ?? []),
  ]);
  const dueYear = new Date(
    due.getTime() + VIETNAM_UTC_OFFSET_MS,
  ).getUTCFullYear();
  return dueYear === year || (dueYear === year + 1 && next) ? due : null;
}
