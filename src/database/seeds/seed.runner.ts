import { AppDataSource } from '@/database/data-source';

import { runInitialDataSeed } from './initial-data.seed';

async function run() {
  console.log('Initializing database connection...');
  await AppDataSource.initialize();

  try {
    const isFresh =
      process.argv.includes('--fresh') || process.argv.includes('--reset');
    if (isFresh) {
      console.log('Resetting database schema (--fresh)...');
      await AppDataSource.synchronize(true);
      console.log('Database schema synchronized successfully.');
    }

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
    console.log(`Seeded ${result.userAddresses.length} user addresses.`);
    console.log(
      `Seeded ${result.pickupLocations.length} shop pickup locations.`,
    );
    console.log(
      `Seeded carts with ${result.cartItems.length} items across ${result.carts.length} accounts (Admin: ${result.users[0].email}, Buyer: ${result.users[1].email}).`,
    );
  } catch (error) {
    console.error('Database seeding failed:', error);
    process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
}

void run();
