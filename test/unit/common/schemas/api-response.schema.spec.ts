import { z } from 'zod';

import { createApiSuccessSchema } from '@/common/schemas';

describe('createApiSuccessSchema', () => {
  const schema = createApiSuccessSchema(z.object({ id: z.string() }), 201);

  it('accepts only the configured HTTP status', () => {
    expect(
      schema.parse({
        statusCode: 201,
        message: 'Created',
        data: { id: 'entity-id' },
      }),
    ).toEqual({
      statusCode: 201,
      message: 'Created',
      data: { id: 'entity-id' },
    });

    expect(
      schema.safeParse({
        statusCode: 200,
        message: 'Created',
        data: { id: 'entity-id' },
      }).success,
    ).toBe(false);
  });

  it('represents the HTTP status as a fixed value in JSON Schema', () => {
    expect(z.toJSONSchema(schema)).toMatchObject({
      properties: {
        statusCode: {
          type: 'number',
          const: 201,
        },
      },
    });
  });
});
