import type { IntegrationDatabase } from '../support/database';
import { createIntegrationDatabase } from '../support/database';

describe('integration database isolation', () => {
  const databases: IntegrationDatabase[] = [];

  afterAll(async () => {
    for (const database of databases) await database.destroy();
  });

  it('isolates schema resets and removes only the schema owned by the suite', async () => {
    const first = await createIntegrationDatabase();
    databases.push(first);
    const second = await createIntegrationDatabase();
    databases.push(second);
    const firstSchema = first.schema;
    const secondSchema = second.schema;
    expect(firstSchema).not.toBe(secondSchema);

    await second.dataSource.query(
      `CREATE TABLE "${secondSchema}".isolation_probe (value integer)`,
    );
    await second.dataSource.query(
      `INSERT INTO "${secondSchema}".isolation_probe VALUES (42)`,
    );
    await first.dataSource.synchronize(true);
    expect(
      await second.dataSource.query(
        `SELECT value FROM "${secondSchema}".isolation_probe`,
      ),
    ).toEqual([{ value: 42 }]);

    await first.destroy();
    expect(
      await second.dataSource.query(
        'SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1',
        [firstSchema],
      ),
    ).toEqual([]);
    expect(
      await second.dataSource.query(
        `SELECT value FROM "${secondSchema}".isolation_probe`,
      ),
    ).toEqual([{ value: 42 }]);
  });
});
