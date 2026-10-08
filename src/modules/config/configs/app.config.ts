import { registerAs } from '@nestjs/config';

import { appSchema } from '../schemas/app.schema';

export const appConfig = registerAs('app', () =>
  appSchema.parse({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    rateLimit: {
      ttl: process.env.RATE_LIMIT_TTL,
      limit: process.env.RATE_LIMIT_LIMIT,
    },
  }),
);
