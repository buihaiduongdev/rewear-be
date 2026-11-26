import { registerAs } from '@nestjs/config';

import { redisSchema } from '../schemas';

export const redisConfig = registerAs('redis', () =>
  redisSchema.parse({
    host: process.env.REDIS_HOST || undefined,
    port: process.env.REDIS_PORT || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
  }),
);
