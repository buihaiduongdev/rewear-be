import path from 'node:path';

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
  const schema = 'public';
  const dataSource = new DataSource({
    ...config,
    synchronize: false,
    entities: [path.join(__dirname, '../../src/modules/**/*.entity.ts')],
    connectTimeoutMS: 5000,
  });
  try {
    await dataSource.initialize();
    await dataSource.synchronize(true);
  } catch (error) {
    if (dataSource.isInitialized) await dataSource.destroy();
    throw error;
  }

  return {
    dataSource,
    schema,
    async destroy() {
      if (dataSource.isInitialized) await dataSource.destroy();
    },
  };
}
