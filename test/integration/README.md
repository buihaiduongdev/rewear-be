# Integration tests

Integration tests call feature services directly and verify real PostgreSQL
behavior. They avoid the HTTP app, guards and request serialization.

| File                    | What it covers                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `commerce-flow.spec.ts` | Product review and publication, cart/checkout reservation, and pickup location persistence.  |
| `seed.spec.ts`          | Loads sample Rewear data, stays safe to rerun, rolls back conflicts and supports moderation. |

Run with `pnpm test:integration`. The test database helper resets entity tables
before each suite; use only the disposable `rewear_test` database.
