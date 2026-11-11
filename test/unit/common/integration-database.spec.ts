import { getIntegrationDatabaseConfig } from '../../support/database';

describe('integration database configuration', () => {
  it('requires an explicit test database', () => {
    expect(() => getIntegrationDatabaseConfig({})).toThrow('DB_NAME');
  });

  it.each(['rewear', 'postgres', 'production_test'])(
    'rejects an unsafe database name: %s',
    (database) => {
      expect(() => getIntegrationDatabaseConfig({ DB_NAME: database })).toThrow(
        'rewear',
      );
    },
  );

  it('rejects a remote server', () => {
    expect(() =>
      getIntegrationDatabaseConfig({
        DB_NAME: 'rewear_test',
        DB_HOST: 'database.example.com',
      }),
    ).toThrow('local');
  });

  it('uses explicit DB options without falling back to DATABASE_URL', () => {
    expect(
      getIntegrationDatabaseConfig({
        DATABASE_URL: 'postgresql://remote.example.com/production',
        DB_NAME: 'rewear_test',
        DB_HOST: '127.0.0.1',
        DB_PORT: '55432',
        DB_USERNAME: 'rewear_test',
        DB_PASSWORD: 'local-test-password',
        DB_SSL: 'false',
      }),
    ).toEqual({
      type: 'postgres',
      host: '127.0.0.1',
      port: 55432,
      username: 'rewear_test',
      password: 'local-test-password',
      database: 'rewear_test',
      ssl: false,
    });
  });
});
