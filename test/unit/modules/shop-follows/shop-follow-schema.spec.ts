import { randomUUID } from 'node:crypto';

import z from 'zod';

import * as schemas from '@/modules/shop-follows/schemas/shop-follow.schema';

describe('Shop Follow contracts', () => {
  it('bounds pagination and rejects client-supplied ownership', () => {
    expect(schemas.shopFollowQuerySchema.parse({})).toEqual({
      limit: 50,
      offset: 0,
    });
    expect(
      schemas.shopFollowQuerySchema.safeParse({ limit: 101 }).success,
    ).toBe(false);
    expect(
      schemas.shopFollowQuerySchema.safeParse({ offset: -1 }).success,
    ).toBe(false);
    expect(
      schemas.shopFollowInputSchema.safeParse({ userId: randomUUID() }).success,
    ).toBe(false);
    expect(schemas.shopFollowInputSchema.parse(undefined)).toEqual({});
  });
  it('describes all API contracts with JSON-compatible dates', () => {
    for (const schema of Object.values(schemas))
      expect(() => z.toJSONSchema(schema, { io: 'input' })).not.toThrow();
  });
});
