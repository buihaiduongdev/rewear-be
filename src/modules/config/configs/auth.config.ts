import { registerAs } from '@nestjs/config';

import { authSchema } from '../schemas';

export const authConfig = registerAs('auth', () =>
  authSchema.parse({
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRATION,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRATION,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
  }),
);
