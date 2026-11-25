import z from 'zod';

import * as coinSchemas from '@/modules/coins/core/schemas/coin.schema';
import * as ratingSchemas from '@/modules/ratings/schemas/rating.schema';

describe('Coin and rating OpenAPI schemas', () => {
  it('represents every response and query schema with JSON-compatible types', () => {
    for (const schema of [
      ...Object.values(coinSchemas),
      ...Object.values(ratingSchemas),
    ]) {
      expect(() => z.toJSONSchema(schema, { io: 'input' })).not.toThrow();
    }
  });
});
