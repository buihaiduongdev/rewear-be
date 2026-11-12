import { AuthProvider } from '@/modules/auth/enums';
import { User } from '@/modules/user/entities';

import type { IntegrationDatabase } from '../support/database';
import { createIntegrationDatabase } from '../support/database';

describe('shared integration database', () => {
  const databases: IntegrationDatabase[] = [];

  afterAll(async () => {
    for (const database of databases) await database.destroy();
  });

  it('resets test tables before each suite while using the same schema', async () => {
    const first = await createIntegrationDatabase();
    databases.push(first);
    await first.dataSource.getRepository(User).save({
      email: 'leftover@example.com',
      fullName: 'Leftover fixture',
      provider: AuthProvider.CREDENTIALS,
      password: null,
      providerAccountId: null,
    });
    await first.destroy();

    const second = await createIntegrationDatabase();
    databases.push(second);
    expect(second.schema).toBe(first.schema);
    expect(await second.dataSource.getRepository(User).count()).toBe(0);
  });
});
