import { AppDataSource } from '@/database/data-source';

import { runInitialDataSeed } from './initial-data.seed';

async function run() {
  console.log('Initializing database connection...');
  await AppDataSource.initialize();

  try {
    console.log('Starting database seeding...');
    const result = await AppDataSource.transaction(async (manager) => {
      return await runInitialDataSeed(manager);
    });
    console.log('Database seeding completed successfully!');
    console.log('Seeded users:');
    result.users.forEach((user) => {
      console.log(`  - ${user.fullName}: ${user.email}`);
    });
    console.log('Seeded shops:');
    result.shops.forEach((shop) => {
      console.log(`  - ${shop.name}`);
    });
  } catch (error) {
    console.error('Database seeding failed:', error);
    process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
}

void run();
