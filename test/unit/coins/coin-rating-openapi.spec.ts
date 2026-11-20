import z from 'zod';

import { createCoinProgramSchema } from '@/modules/coins/programs/schemas/coin-program.schema';
import * as views from '@/modules/ratings/schemas/rating-view.schema';

describe('Coin and rating OpenAPI schemas', () => {
  it('represents every response and program request with JSON-compatible dates', () => {
    for (const schema of [createCoinProgramSchema, ...Object.values(views)]) {
      expect(() => z.toJSONSchema(schema, { io: 'input' })).not.toThrow();
    }
  });
});
