import path from 'node:path';

import * as dotenv from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

import { databaseConfig } from '../config/configs';

dotenv.config();

export const dbOptions: DataSourceOptions = {
  ...databaseConfig(),
  entities: [path.join(__dirname, '..', '**', '*.entity.{js,ts}')],
  synchronize: true,
  ssl: true,
};

export const AppDataSource = new DataSource({
  ...dbOptions,
  migrations: [path.join(__dirname, 'migrations', '*.{js,ts}')],
});
