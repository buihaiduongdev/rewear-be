import { ConflictException } from '@nestjs/common';

import { RETURN_DAY_MS, RETURN_STATE } from '../constants/return.constant';
import type { DisputeReturn } from '../entities/dispute-return.entity';

export function handoverExpired(row: DisputeReturn, now: Date) {
  return (
    row.state === RETURN_STATE.AWAITING_HANDOVER &&
    !row.obstaclePending &&
    !!row.handoverBy &&
    now > row.handoverBy
  );
}

export function resumedHandoverDeadline(remainingMs: number, now: Date) {
  return new Date(now.getTime() + Math.max(RETURN_DAY_MS, remainingMs));
}

/** A verified historical scan may require reopening review, never automatic money movement. */
export function requiresTimelyHandoverReview(row: DisputeReturn, at: Date) {
  return (
    row.state === RETURN_STATE.EXPIRED &&
    !!row.handoverBy &&
    at <= row.handoverBy
  );
}

export function assertReturnResumable(row: DisputeReturn) {
  if (row.state !== RETURN_STATE.PAUSED || row.handoverAt)
    throw new ConflictException('Only an unshipped paused return can resume');
  if (row.labelReplacementRequired)
    throw new ConflictException('Cancelled carrier label must be replaced');
}

/** Preserve actual scans; a valid paused clock resumes at physical handover. */
export function applyVerifiedHandoverClock(row: DisputeReturn, at: Date) {
  row.handoverAt = at;
  row.timelyHandoverReviewRequired = requiresTimelyHandoverReview(row, at);
  if (row.labelReplacementRequired) {
    row.timelyHandoverReviewRequired = true;
    return;
  }
  if (row.state === RETURN_STATE.PAUSED) {
    const effectivePauseAt = row.obstacleAt ?? row.pausedAt;
    if (
      effectivePauseAt &&
      at >= effectivePauseAt &&
      row.remainingMs !== null
    ) {
      row.handoverBy = resumedHandoverDeadline(Number(row.remainingMs), at);
      row.state = RETURN_STATE.IN_TRANSIT;
    } else if (row.handoverBy && at <= row.handoverBy) {
      row.state = RETURN_STATE.IN_TRANSIT;
    } else {
      row.timelyHandoverReviewRequired = true;
    }
  } else if (
    row.state === RETURN_STATE.AWAITING_HANDOVER &&
    row.handoverBy &&
    at <= row.handoverBy
  ) {
    row.state = RETURN_STATE.IN_TRANSIT;
  }
}
