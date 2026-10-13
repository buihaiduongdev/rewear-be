import { registerAs } from '@nestjs/config';

import { aiSchema } from '../schemas';

export const aiConfig = registerAs('ai', () =>
  aiSchema.parse({
    apiKey: process.env.API_KEY,
    model: process.env.API_MODEL,
  }),
);
