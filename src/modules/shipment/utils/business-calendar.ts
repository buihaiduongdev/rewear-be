import { VIETNAM_UTC_OFFSET_MS } from '../constants/calendar.constant';

export function businessDeadline(receivedAt: Date, days: number): Date {
  if (!Number.isFinite(receivedAt.getTime())) {
    throw new RangeError('Received date must be valid');
  }
  if (!Number.isSafeInteger(days) || days <= 0) {
    throw new RangeError('Business days must be a positive safe integer');
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
    if (weekday !== 0 && weekday !== 6) {
      remaining -= 1;
    }
  }
  localDay.setUTCHours(17, 0, 0, 0);
  return new Date(localDay.getTime() - VIETNAM_UTC_OFFSET_MS);
}
