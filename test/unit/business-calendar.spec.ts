import { businessDeadline } from '../../src/modules/shipment/utils/business-calendar';

describe('businessDeadline', () => {
  it.each([
    ['2026-11-16T01:00:00Z', 1, '2026-11-17T10:00:00.000Z'],
    ['2026-11-20T09:00:00Z', 1, '2026-11-23T10:00:00.000Z'],
    ['2026-11-21T01:00:00Z', 2, '2026-11-24T10:00:00.000Z'],
    ['2026-11-19T17:30:00Z', 1, '2026-11-23T10:00:00.000Z'],
    ['2026-12-31T01:00:00Z', 1, '2027-01-01T10:00:00.000Z'],
    ['2028-02-28T01:00:00Z', 1, '2028-02-29T10:00:00.000Z'],
  ])(
    'calculates %s plus %i weekend-skipping business days',
    (received, days, expected) => {
      expect(businessDeadline(new Date(received), days).toISOString()).toBe(
        expected,
      );
    },
  );

  it.each([0, -1, 1.5, NaN, Infinity])(
    'rejects invalid day count %s',
    (days) => {
      expect(() =>
        businessDeadline(new Date('2026-11-16T00:00:00Z'), days),
      ).toThrow(RangeError);
    },
  );

  it('rejects an invalid received date and does not mutate input', () => {
    expect(() => businessDeadline(new Date(NaN), 1)).toThrow(RangeError);
    const receivedAt = new Date('2026-11-20T20:00:00Z');
    expect(businessDeadline(receivedAt, 1).toISOString()).toBe(
      '2026-11-23T10:00:00.000Z',
    );
    expect(receivedAt.toISOString()).toBe('2026-11-20T20:00:00.000Z');
  });
});
