import { registerAs } from '@nestjs/config';

import { corsSchema } from '../schemas/cors.schema';

export const corsConfig = registerAs('cors', () =>
  corsSchema.parse({ origin: process.env.CORS_ORIGIN }),
);
