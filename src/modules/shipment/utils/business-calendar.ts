import { VIETNAM_UTC_OFFSET_MS } from '../constants/calendar.constant';

/** The caller supplies the approved closures covering the calculation period. */
export function businessDeadline(
  receivedAt: Date,
  days: number,
  closedDates: readonly string[],
): Date {
  if (!Number.isFinite(receivedAt.getTime())) {
    throw new RangeError('Received date must be valid');
  }
  if (!Number.isSafeInteger(days) || days <= 0) {
    throw new RangeError('Business days must be a positive safe integer');
  }

  const closures = new Set<string>();
  for (const closedDate of closedDates) {
    const parsed = new Date(`${closedDate}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(closedDate) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== closedDate
    ) {
      throw new RangeError('Closure dates must be real YYYY-MM-DD dates');
    }
    closures.add(closedDate);
  }

  const localDay = new Date(receivedAt.getTime() + VIETNAM_UTC_OFFSET_MS);
  localDay.setUTCHours(0, 0, 0, 0);
  let remaining = days;
  while (remaining > 0) {
    localDay.setUTCDate(localDay.getUTCDate() + 1);
    if (!Number.isFinite(localDay.getTime())) {
      throw new RangeError(
        'Business deadline is outside the supported date range',
      );
    }
    const weekday = localDay.getUTCDay();
    const dateKey = localDay.toISOString().slice(0, 10);
    if (weekday !== 0 && weekday !== 6 && !closures.has(dateKey)) {
      remaining -= 1;
    }
  }
  localDay.setUTCHours(17, 0, 0, 0);
  return new Date(localDay.getTime() - VIETNAM_UTC_OFFSET_MS);
}
