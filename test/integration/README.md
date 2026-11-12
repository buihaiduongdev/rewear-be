# Integration tests

Integration tests call feature services directly and verify real PostgreSQL
behavior. They avoid the HTTP app, guards and request serialization.

| File                       | What it covers                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `commerce-flow.spec.ts`    | Product review and publication, cart/checkout reservation, and pickup location persistence. |
| `marketplace-seed.spec.ts` | Marketplace seed data, reruns, rollback on conflicts and moderation.                        |

Run with `pnpm test:integration`. The test database helper resets entity tables
before each suite; use only the disposable `rewear_test` database.
