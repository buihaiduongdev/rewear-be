import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { Client } from 'pg';
import { DataSource } from 'typeorm';

import { databaseSchema } from '@/modules/config/schemas/database.schema';

export interface IntegrationDatabase {
  dataSource: DataSource;
  schema: string;
  destroy(): Promise<void>;
}

export function getIntegrationDatabaseConfig(
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (
    !environment.DB_NAME ||
    !/^rewear[a-z0-9_]*_test$/.test(environment.DB_NAME)
  ) {
    throw new Error(
      'Set DB_NAME explicitly to a dedicated rewear*_test database for integration tests',
    );
  }
  const config = databaseSchema.omit({ url: true }).parse({
    type: environment.DB_TYPE,
    host: environment.DB_HOST,
    port: environment.DB_PORT,
    username: environment.DB_USERNAME,
    password: environment.DB_PASSWORD,
    database: environment.DB_NAME,
    ssl: environment.DB_SSL,
  });
  if (!['localhost', '127.0.0.1', '::1'].includes(config.host)) {
    throw new Error('Integration tests require a local PostgreSQL server');
  }
  return config;
}

export async function createIntegrationDatabase(): Promise<IntegrationDatabase> {
  const config = getIntegrationDatabaseConfig();
  const schema = `integration_${randomUUID().replaceAll('-', '')}`;
  const admin = new Client({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    ssl: config.ssl,
    connectionTimeoutMillis: 5000,
  });
  const dataSource = new DataSource({
    ...config,
    schema,
    synchronize: true,
    entities: [path.join(__dirname, '../../src/modules/**/*.entity.ts')],
    connectTimeoutMS: 5000,
  });
  let schemaCreated = false;
  try {
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await dataSource.initialize();
  } catch (error) {
    try {
      if (dataSource.isInitialized) await dataSource.destroy();
      if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await admin.end();
    }
    throw error;
  }

  let destroyed = false;
  return {
    dataSource,
    schema,
    async destroy() {
      if (destroyed) return;
      try {
        if (dataSource.isInitialized) await dataSource.destroy();
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        destroyed = true;
        await admin.end();
      }
    },
  };
}
