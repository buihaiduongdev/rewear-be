# Re.wear

[Tổng quan tính năng, link Figma và mục lục tài liệu](docs/README.md).

## Project setup

Use Node.js 24 LTS (minimum 24.9, see `.nvmrc`) and pnpm 11.22.0. NestJS 12
ships ESM packages; the test scripts enable VM modules so Jest can load them
without rewriting framework dependencies.

```bash
 pnpm install
```

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
# unit tests
 pnpm run test

# e2e tests
 pnpm run test:e2e

# test coverage
 pnpm run test:cov
```

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

`pnpm test --runInBand` runs unit checks. `pnpm test:e2e --runInBand` boots real
controllers and the validation/serialization pipeline with mocked persistence;
it checks request rejection, coercion, login ordering, HTTP status, response
filtering and generated OpenAPI. It does not prove PostgreSQL or external-service
integration. The HTTP contract suite also writes a temporary OpenAPI snapshot
to `/tmp/rewear-standard-schema-openapi.json` for local client-generation checks.

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
