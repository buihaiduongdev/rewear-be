import {
  appealWindowEnded,
  classifyAppealEligibility,
} from '@/modules/dispute/dispute-appeal.policy';

describe('appeal clock policy', () => {
  const deadline = new Date('2026-11-18T10:00:00Z');

  it('keeps attempts pending until the approved calendar establishes the deadline', () => {
    expect(classifyAppealEligibility(deadline, null)).toBe('PENDING_CALENDAR');
  });

  it('accepts filing exactly at the original deadline', () => {
    expect(classifyAppealEligibility(deadline, deadline)).toBe('ACCEPTED');
    expect(appealWindowEnded(deadline, deadline)).toBe(false);
  });

  it('rejects a filing one millisecond late and permits closing the window', () => {
    const late = new Date(deadline.getTime() + 1);
    expect(classifyAppealEligibility(late, deadline)).toBe('OUT_OF_TIME');
    expect(appealWindowEnded(late, deadline)).toBe(true);
  });

  it('never closes a window whose calendar remains missing', () => {
    expect(appealWindowEnded(deadline, null)).toBe(false);
  });
});
