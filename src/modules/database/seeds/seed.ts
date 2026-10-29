import path from 'node:path';

import * as dotenv from 'dotenv';
import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { seedMarketplace, validateSeedOptions } from './marketplace.seed';

export function validateSeedTarget(
  url: string | undefined,
  environment: string | undefined,
): string {
  if (environment === 'production')
    throw new Error('Seeding is disabled in production');
  if (!url)
    throw new Error(
      'Set SEED_DATABASE_URL explicitly; the seed never falls back to DATABASE_URL',
    );
  const target = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(target.protocol))
    throw new Error('Seed requires PostgreSQL');
  return url;
}

export function validateSeedSchemaTarget(url: string): void {
  const target = new URL(url);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    !/^\/rewear[a-z0-9_]*_(dev|test|seed)$/.test(target.pathname)
  )
    throw new Error(
      'Schema synchronization requires a dedicated local rewear _dev, _test or _seed database',
    );
}

export async function runSeed() {
  dotenv.config({ quiet: true });
  const url = validateSeedTarget(
    process.env.SEED_DATABASE_URL,
    process.env.NODE_ENV,
  );
  const options = {
    namespace: process.env.SEED_NAMESPACE,
    productCount:
      process.env.SEED_PRODUCT_COUNT === undefined
        ? undefined
        : Number(process.env.SEED_PRODUCT_COUNT),
    password: process.env.SEED_PASSWORD,
  };
  validateSeedOptions(options);
  if (process.env.SEED_SYNC_SCHEMA === 'true') validateSeedSchemaTarget(url);
  const dataSource = new DataSource({
    type: 'postgres',
    url,
    entities: [path.join(__dirname, '..', '..', '**', '*.entity.{js,ts}')],
    synchronize: process.env.SEED_SYNC_SCHEMA === 'true',
    migrationsRun: false,
    logging: false,
  });
  try {
    await dataSource.initialize();
    const manifest = await seedMarketplace(dataSource, options);
    console.log(JSON.stringify(manifest, null, 2));
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

if (require.main === module) {
  void runSeed().catch(() => {
    // Database errors may contain credentials or password hashes; do not print the raw error.
    console.error(
      'Seed failed. Check SEED_DATABASE_URL, schema and seed options. No seed transaction was partially applied.',
    );
    process.exitCode = 1;
  });
}
