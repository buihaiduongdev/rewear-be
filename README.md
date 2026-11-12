# Re.wear

[Tổng quan tính năng, link Figma và mục lục tài liệu](docs/README.md).

## Project setup

Use Node.js 24 LTS (minimum 24.9, see `.nvmrc`) and pnpm 11.22.0. NestJS 12
ships ESM packages; the test scripts enable VM modules so Jest can load them
without rewriting framework dependencies.

```bash
 pnpm install
```

## Local PostgreSQL

From `rewear-be`, start PostgreSQL 16 and wait for it to become healthy:

```bash
docker compose up -d --wait db
```

The server listens at `127.0.0.1:5432`, with username/password
`postgres`/`postgres`. It creates only the development database `rewear`.
Data persists in the `postgres_data` volume across container restarts.

If port 5432 is already in use, run `LOCAL_DB_PORT=55432 docker compose up -d --wait db`
and use port 55432 in the backend connection configuration.

Stop the server with `docker compose down`; its volume is retained.
The local server uses connections without TLS. Set `DB_SSL=false` in `.env`
when connecting the backend to it, as shown in `.env.example`. SSL remains
enabled when `DB_SSL` is omitted; use `DB_SSL=true` for servers that require TLS.

## Compile and run the project

```bash
# development
 pnpm run start

# watch mode
 pnpm run start:dev

# production mode
 pnpm run start:prod
```

## Run tests

```bash
# unit tests (no PostgreSQL required)
 pnpm test:unit

# all tests (test PostgreSQL required)
 pnpm test

# direct feature/database integration tests only
 pnpm test:integration

# HTTP end-to-end tests only (test PostgreSQL required)
 pnpm test:e2e

# test coverage
 pnpm run test:cov
```

CI creates a disposable PostgreSQL 16 service with database `rewear_test`,
sets `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` and `DB_SSL`,
and runs unit, integration and HTTP E2E suites sequentially through `pnpm test`.
Each database suite resets the tables in the shared `public` schema before it
runs. This test database is disposable and must not contain development data.
This project currently uses schema synchronization rather than a
migration-based test setup.

For a local integration run, use a separate disposable server:

```bash
docker run --rm -d --name rewear-test-db \
  -e POSTGRES_USER=rewear_test -e POSTGRES_PASSWORD=rewear_test \
  -e POSTGRES_DB=rewear_test -p 127.0.0.1:55432:5432 \
  postgres:16-alpine

# Wait until this reports that PostgreSQL is accepting connections.
docker exec rewear-test-db pg_isready -U rewear_test -d rewear_test

DB_HOST=127.0.0.1 DB_PORT=55432 DB_USERNAME=rewear_test \
DB_PASSWORD=rewear_test DB_NAME=rewear_test DB_SSL=false \
  pnpm test

docker stop rewear-test-db
```

Tests read the explicit `DB_*` environment variables; they do not load `.env`
or fall back to `DATABASE_URL`. Database tests require a local server and a
database name matching `rewear*_test`. Missing configuration or an unavailable
database fails the run instead of skipping suites. Never point them at the
development database. `pnpm test:seed` uses this same configuration to run only
the marketplace seed integration suite.

Copy `.env.example` to `.env` and configure the JWT secrets, Google OAuth client
ID, SMTP server, and frontend URL before starting the authentication endpoints.

All endpoints use the `/api` prefix. Authentication routes are under
`/api/auth`; administrators can manage users under `/api/users`, while an
authenticated user can read and update `/api/users/me`.

`GET /api/users` supports `page` (default 1), `pageSize` (default 10, maximum
100), `order` (`ASC`/`DESC`, default `DESC`), `sortBy` (`createdAt`, `email`,
`fullName`), `search` (name/email), `role`, and `status`. The response's `data`
contains `{ items, meta }`; `meta` includes `page`, `pageSize`, `total`,
`totalPage`, `hasNextPage`, and `hasPreviousPage`.

Vietnamese administrative divisions are exposed publicly through
`GET /api/administrative-divisions/provinces` and
`GET /api/administrative-divisions/provinces/:provinceCode/wards`. The data is
a versioned two-level snapshot, so these requests do not depend on an external
service at runtime.

When creating or updating a user address, clients submit `provinceCode` and
`wardCode`. The backend validates that the ward belongs to the province and
stores the canonical province and ward names from the snapshot.

## Request schemas

Each module declares request schemas and inferred `*Input` types under `schemas/`.
Controllers attach those schemas directly to `@Body({ schema })`,
`@Query({ schema })`, or `@Param('id', { schema })`. A global native
`StandardSchemaValidationPipe` validates and transforms requests; Swagger reads
the same parameter metadata to generate OpenAPI. No DTO class or duplicated
`ApiProperty` declarations are needed.

Bodies reject unknown keys and do not coerce numeric or boolean strings. Query
schemas retain numeric conversion and pagination defaults. PATCH schemas allow
omitted fields without applying creation defaults. Explicit `null` clears
nullable address/product text; `null` for legacy optional non-nullable inputs is
treated as omitted. Product/address text retains the previous whitespace
normalization.

Validation failures return HTTP 400 with a `message` array and structured
`errors: [{ path, message, code }]`. The frontend's existing string/array message
handling remains supported. Query validation now also uses the message array
instead of the former generic `Validation failed` string. Error wording comes
from the schema library and should not be used as a stable machine identifier.

Credentials login uses `POST /api/auth/login` with required `{ email, password }`.
OAuth uses `POST /api/auth/oauth` with required `{ provider, token }`; only `google`
is currently supported. Existing clients must stop sending `provider` to login
and move Google login requests to the OAuth endpoint. Both endpoints return the
same token-pair envelope. The global validation pipe checks the route-specific
body before the controller calls its strategy; OpenAPI documents the same
required fields. Login and OAuth do not need separate guards. Credentials call
`CredentialAuthStrategy` directly; `OAuthStrategyFactory` selects only OAuth
strategies using a shared input contract, with no credentials/OAuth union or overloads.
User management IDs now receive the same UUID validation as other resource IDs.

Response serialization remains separate: `@Serialize(responseSchema)` filters
output and documents the existing `{ statusCode, message, data }` envelope and
ISO date strings. This refactor does not change database entities or business
state transitions.

HTTP request/response tests live in `test/e2e` and run with `pnpm test:e2e`.
They exercise the Nest application pipeline; most use PostgreSQL, while the
request-validation contract suite mocks persistence. Direct PostgreSQL feature
integration tests live in `test/integration` and run with
`pnpm test:integration`. See the README in each folder for suite coverage.
The HTTP contract suite writes an OpenAPI snapshot to
`/tmp/rewear-standard-schema-openapi.json` for local client-generation checks.

## Product drafts and moderation

Product creation now saves incomplete drafts. Publishing requires submission and
admin approval; seller status updates only hide/reactivate approved listings.
Product responses include `coverUrl` and `mediaCount`. Draft fields can be null;
regenerate API clients from `/api/docs-json` after switching to this backend.
See [product lifecycle/API contract](docs/PRODUCT_LIFECYCLE.md) for routes,
photo/measurement requirements, image retention and PostgreSQL test setup.
Upload clients must send the returned `If-None-Match` header; configure bucket
CORS to allow that header before testing direct uploads.

## Development seed

Use `pnpm seed` with an explicit `SEED_DATABASE_URL` to populate a development
PostgreSQL database with accounts, shops, categories, approved products and images.
See [seed commands, fixture accounts and E2E factory usage](docs/SEEDING.md).
