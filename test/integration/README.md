# Integration tests

Integration suites call the feature/service layer directly and verify its
behavior against PostgreSQL. HTTP requests and responses belong in
`test/e2e`. These tests do not test the database helper itself.

| File                       | What it covers                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `marketplace-seed.spec.ts` | Marketplace seed data, reruns, rollback on conflicts and moderation of seeded products. |

Run this suite with `pnpm test:integration`. The test helper resets entity
tables before it runs, so point it only at the disposable `rewear_test`
database.
