import { registerAs } from '@nestjs/config';

import { appSchema } from '../schemas/app.schema';

export const appConfig = registerAs('app', () =>
  appSchema.parse({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
  }),
);
