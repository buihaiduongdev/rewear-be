# HTTP end-to-end tests

These suites send requests through the Nest HTTP application and check the
observable API behavior. Most connect to PostgreSQL; request-validation checks
the HTTP pipeline with persistence mocked.

| File                         | What it covers                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `cart.spec.ts`               | Authentication, cart operations, seller ownership, listing availability, grouping and concurrent requests. |
| `checkout.spec.ts`           | Reservations, checkout snapshots, shipping quotes, cancellation, expiry and concurrent requests.           |
| `pickup-location.spec.ts`    | Personal/shop pickup APIs, authorization, request validation, privacy and database constraints.            |
| `product-lifecycle.spec.ts`  | Product APIs for drafts, media, submission, moderation, revisions and concurrent changes.                  |
| `request-validation.spec.ts` | HTTP validation, response serialization, auth inputs and generated OpenAPI; persistence is mocked.         |

Run these with `pnpm test:e2e`. They are also included in the full `pnpm test`
run and in CI.
