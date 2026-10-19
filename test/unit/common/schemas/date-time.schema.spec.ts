import { z } from 'zod';

import { dateTimeSchema } from '@/common/schemas';

describe('dateTimeSchema', () => {
  it('serializes Date values to ISO strings', () => {
    expect(dateTimeSchema.parse(new Date('2026-10-19T12:00:00.000Z'))).toBe(
      '2026-10-19T12:00:00.000Z',
    );
  });

  it('can be represented as an OpenAPI-compatible JSON Schema', () => {
    expect(z.toJSONSchema(dateTimeSchema)).toMatchObject({
      type: 'string',
      format: 'date-time',
    });
  });
});
