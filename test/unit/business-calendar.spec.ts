import { businessDeadline } from '../../src/modules/shipment/business-calendar';

describe('businessDeadline', () => {
  it.each([
    ['2026-11-16T01:00:00Z', 1, [], '2026-11-17T10:00:00.000Z'],
    ['2026-11-20T09:00:00Z', 1, [], '2026-11-23T10:00:00.000Z'],
    ['2026-11-21T01:00:00Z', 2, [], '2026-11-24T10:00:00.000Z'],
    ['2026-11-19T17:30:00Z', 1, [], '2026-11-23T10:00:00.000Z'],
    ['2026-11-20T01:00:00Z', 2, ['2026-11-23'], '2026-11-25T10:00:00.000Z'],
    ['2026-12-31T01:00:00Z', 1, ['2027-01-01'], '2027-01-04T10:00:00.000Z'],
    ['2028-02-28T01:00:00Z', 1, ['2028-02-29'], '2028-03-01T10:00:00.000Z'],
  ])(
    'calculates %s plus %i business days',
    (received, days, closures, expected) => {
      expect(
        businessDeadline(new Date(received), days, closures).toISOString(),
      ).toBe(expected);
    },
  );

  it.each([0, -1, 1.5, NaN, Infinity])(
    'rejects invalid day count %s',
    (days) => {
      expect(() =>
        businessDeadline(new Date('2026-11-16T00:00:00Z'), days, []),
      ).toThrow(RangeError);
    },
  );

  it.each([
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-01',
    '2026-01-00',
    '2026-1-01',
    '2026-01-01T00:00:00Z',
    'garbage',
  ])('rejects invalid closure %s', (closedDate) => {
    expect(() =>
      businessDeadline(new Date('2026-11-16T00:00:00Z'), 1, [closedDate]),
    ).toThrow(RangeError);
  });

  it('rejects an invalid received date', () => {
    expect(() => businessDeadline(new Date(NaN), 1, [])).toThrow(RangeError);
  });

  it('preserves its inputs and tolerates duplicate and weekend closures', () => {
    const receivedAt = new Date('2026-11-20T20:00:00Z');
    const closures = Object.freeze(['2026-11-22', '2026-11-23', '2026-11-23']);
    expect(businessDeadline(receivedAt, 1, closures).toISOString()).toBe(
      '2026-11-24T10:00:00.000Z',
    );
    expect(receivedAt.toISOString()).toBe('2026-11-20T20:00:00.000Z');
  });
});
