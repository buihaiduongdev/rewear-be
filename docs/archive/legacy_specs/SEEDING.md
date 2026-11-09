# Marketplace seed and factories

The seed uses the current product lifecycle in [PRODUCT_LIFECYCLE.md](PRODUCT_LIFECYCLE.md).
It writes real PostgreSQL rows, including matching approved revisions and retained
image evidence. The frontend continues to call the normal API.

## Run against an existing development database

Use Node 24.9+ and install the backend dependencies. Set `SEED_DATABASE_URL`
explicitly to the intended **development** database. It never falls back to the
application's `DATABASE_URL`, and refuses `NODE_ENV=production`.

```bash
SEED_DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DEVELOPMENT_DATABASE' pnpm seed
```

For a remote database, use the TLS parameters required by your provider in the
connection URL. Schema synchronization is disabled by default; start the backend
with the new entities before seeding an existing development database.

To initialize a new, disposable local database:

```bash
createdb rewear_seed
SEED_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/rewear_seed' SEED_SYNC_SCHEMA=true pnpm seed
```

`SEED_SYNC_SCHEMA=true` is allowed only for a loopback host and a database named
`rewear…_dev`, `rewear…_test` or `rewear…_seed`. Synchronization can change a schema,
so use it only when initializing a disposable local database.

## Default dataset

| Records                          |                                                         Count |
| -------------------------------- | ------------------------------------------------------------: |
| Active accounts                  |      7: admin, buyer, three shop owners, two personal sellers |
| Categories                       |                              6, with measurement requirements |
| Active shops / owner memberships |                                                         3 / 3 |
| Products                         |                                                            36 |
| Public approved ACTIVE products  |                                                            30 |
| Other products                   | One each: DRAFT, PENDING_REVIEW, REJECTED, HIDDEN, HELD, SOLD |
| Images                           |                                        108: three per product |
| Review revisions                 |           35, including a pending review and rejection reason |
| Image links                      |    213: current listing images and retained revision evidence |

Default logins include `admin.demo@seed.rewear.test`,
`buyer.demo@seed.rewear.test` and `seller-1.demo@seed.rewear.test`.
The development-only password is `RewearSeed123!`. Users are already ACTIVE;
seeding does not send email. Set `SEED_PASSWORD` to use another password when
creating a new namespace; rerunning does not reset existing passwords.

The command prints a JSON manifest containing IDs, account emails and expected
fixture counts, never passwords or connection credentials. A UUID is stable for
a namespace and record key. Rerunning inserts missing rows and preserves existing
rows and edits; counts in the manifest describe the intended dataset, not newly
inserted rows. It never truncates tables, deletes records or resets the database.

Options:

| Environment variable | Default          | Meaning                                                        |
| -------------------- | ---------------- | -------------------------------------------------------------- |
| `SEED_DATABASE_URL`  | Required         | Explicit development/test PostgreSQL connection                |
| `SEED_NAMESPACE`     | `demo`           | 1–32 lowercase letters/digits/hyphens; isolates IDs and emails |
| `SEED_PRODUCT_COUNT` | `36`             | Integer 12–200; six non-public states, the rest ACTIVE         |
| `SEED_PASSWORD`      | `RewearSeed123!` | Password for new fixture accounts, at least 8 characters       |
| `SEED_SYNC_SCHEMA`   | `false`          | Opt-in schema initialization, dedicated local targets only     |

All inserts run in one transaction. An ownership or other constraint failure
rolls back the entire seed. Runs for the same namespace serialize through a
PostgreSQL advisory lock. Use a fresh database/schema or namespace for repeatable
E2E scenarios; this command intentionally does not reset changed test state.

## Image fixtures

Images use six explicit Unsplash JPEG URLs that were checked when adding the
seed. This requires network access in the browser. The same category photo is
reused for the three FRONT/BACK/DETAIL fixture slots; the fixtures exercise media
relationships and metadata, not visual proof of an item's condition.

No R2 upload, object mutation or email is performed by the seed. Image storage
keys are in `seed/<namespace>/…`, not live upload tickets. These are development
fixtures, not confirmation of an uploaded object. The normal R2 upload flow needs
separate tests against storage. Do not use these fixture images to test actual
R2 deletion or overwrite behavior.

## Reuse factories in tests

`MarketplaceFactory` has pure builders for users, categories, shops, memberships,
products, media and media links, with explicit per-record overrides. The builders
perform no I/O. `seedMarketplace(dataSource, options)` composes the complete
related graph and returns its manifest. Pass `now` for a fixed clock in E2E tests.

```ts
const factory = new MarketplaceFactory(
  'checkout-test',
  new Date('2026-01-01T12:00:00Z'),
);
const manifest = await seedMarketplace(dataSource, {
  namespace: 'checkout-test',
  now: factory.now,
});
const buyerId = manifest.accounts[1].id;
const productId = factory.id('product:0');
```

## Verification

Unit tests run with `pnpm test`. PostgreSQL integration tests use a separate,
explicit, loopback `rewear…_test` database. They create and remove their own unique
schema and do not clear the database's public schema.

```bash
createdb rewear_seed_test
SEED_TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/rewear_seed_test' pnpm test:seed
```

The integration suite verifies public products through the real ProductService,
response schema, cover images, revision evidence, login password hashes,
concurrent repeated seeds, preservation of edits/unrelated data and rollback on
an ownership conflict. It skips when `SEED_TEST_DATABASE_URL` is absent; a skipped
suite is not evidence of a successful database test.
