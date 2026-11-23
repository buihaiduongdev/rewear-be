import { AppDataSource } from '@/database/data-source';
import { Category } from '@/modules/category/entities';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { Shop } from '@/modules/shop/entities';
import { UserAddress } from '@/modules/user-address/entities';
import { User } from '@/modules/user/entities';

import { SEED_ACCOUNTS, SEED_CATEGORIES, SEED_SHOPS } from './catalog';
import { runInitialDataSeed, seedBuyerOrders } from './initial-data.seed';

async function run() {
  const isFresh =
    process.argv.includes('--fresh') || process.argv.includes('--reset');
  const ordersOnly = process.argv.includes('--orders-only');
  if (isFresh && ordersOnly)
    throw new Error('--orders-only cannot be combined with --fresh');
  if (ordersOnly) AppDataSource.setOptions({ synchronize: false });
  console.log('Initializing database connection...');
  await AppDataSource.initialize();

  try {
    if (isFresh) {
      console.log('Resetting database schema (--fresh)...');
      await AppDataSource.synchronize(true);
      console.log('Database schema synchronized successfully.');
    }

    if (ordersOnly) {
      const orders = await AppDataSource.transaction(async (manager) => {
        const users: User[] = [];
        const shops: Shop[] = [];
        const categories: Category[] = [];
        for (const account of SEED_ACCOUNTS)
          users.push(
            await manager.getRepository(User).findOneByOrFail({
              email: `${account.key}.demo@seed.rewear.test`,
            }),
          );
        for (const data of SEED_SHOPS)
          shops.push(
            await manager
              .getRepository(Shop)
              .findOneByOrFail({ name: data.name }),
          );
        for (const category of SEED_CATEGORIES)
          categories.push(
            await manager
              .getRepository(Category)
              .findOneByOrFail({ slug: `seed-demo-${category.slug}` }),
          );
        const userAddresses = await manager
          .getRepository(UserAddress)
          .findBy({ userId: users[1].id });
        const pickupLocations = await manager
          .getRepository(PickupLocation)
          .find();
        return seedBuyerOrders(manager, {
          users,
          shops,
          categories,
          userAddresses,
          pickupLocations,
        });
      });
      console.log(`Ensured ${orders.length} demo buyer orders.`);
      return;
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
    console.log(
      `Seeded ${result.orders.length} buyer orders (3 pending, 1 preparing, 1 shipping, 1 delivered).`,
    );
    console.log(
      `Seeded ${result.wishlist.length} wishlist items, ${result.follows.length} shop follows and ${result.conversations.length} conversations.`,
    );
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
