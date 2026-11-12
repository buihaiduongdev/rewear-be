import { databaseSchema } from '@/modules/config/schemas/database.schema';

describe('database SSL configuration', () => {
  it('keeps SSL enabled by default', () => {
    expect(databaseSchema.parse({})).toMatchObject({ ssl: true });
  });

  it('disables SSL explicitly for local PostgreSQL', () => {
    expect(databaseSchema.parse({ ssl: 'false' })).toMatchObject({
      ssl: false,
    });
  });

  it('rejects invalid SSL values', () => {
    expect(databaseSchema.safeParse({ ssl: 'invalid' }).success).toBe(false);
  });
});
