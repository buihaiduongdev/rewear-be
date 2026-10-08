import { registerAs } from '@nestjs/config';

import { databaseSchema } from '../schemas/database.schema';

export const databaseConfig = registerAs('database', () => {
  return databaseSchema.parse({
    url: process.env.DATABASE_URL,
    type: process.env.DB_TYPE,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
});
