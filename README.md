# Re.wear

## Project setup

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
