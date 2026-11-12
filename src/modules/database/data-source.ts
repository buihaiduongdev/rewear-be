import path from 'node:path';

import * as dotenv from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

import { databaseConfig } from '@/modules/config/configs';

dotenv.config();

export const dbOptions: DataSourceOptions = {
  ...databaseConfig(),
  entities: [path.join(__dirname, '..', '**', '*.entity.{js,ts}')],
  synchronize: true,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

export const AppDataSource = new DataSource({
  ...dbOptions,
  migrations: [path.join(__dirname, 'migrations', '*.{js,ts}')],
});
