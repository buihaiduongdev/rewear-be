# Integration tests

These suites exercise Rewear features against PostgreSQL, or through HTTP with
the real request pipeline. They do not test the test database helper itself.

| File                         | What it covers                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `cart.spec.ts`               | Cart authentication, adding/removing items, duplicate and concurrent requests, seller ownership, availability and grouping by seller. |
| `checkout.spec.ts`           | Reservation and cancellation, price/address snapshots, shipping quote requests, expiry, retries and concurrent buyers.                |
| `marketplace-seed.spec.ts`   | Marketplace seed data, reruns, rollback on conflicts and moderation of seeded products.                                               |
| `pickup-location.spec.ts`    | Personal and shop pickup locations, access control, address validation, privacy and database constraints.                             |
| `product-lifecycle.spec.ts`  | Product drafts, ownership, media, submissions, moderation, revisions, reservations and concurrent changes.                            |
| `request-validation.spec.ts` | HTTP status/response serialization, request validation, auth input and generated OpenAPI; persistence is mocked here.                 |

Run all suites with `pnpm test:integration`. The test helper resets entity
tables before each PostgreSQL suite, so point it only at the disposable
`rewear_test` database.
