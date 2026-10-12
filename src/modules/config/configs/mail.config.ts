import { registerAs } from '@nestjs/config';

import { mailSchema } from '../schemas';

export const mailConfig = registerAs('mail', () =>
  mailSchema.parse({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.MAIL_USER,
    password: process.env.MAIL_PASS,
    from: process.env.MAIL_FROM,
    frontendUrl: process.env.FRONTEND_URL,
  }),
);
