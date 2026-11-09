# Shipping Quote Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; user requested solo.

**Goal:** Real sandbox shipping estimates, one parcel per checkout seller/shop.
**Architecture:** Pure parcel aggregation, GHN staging preview adapter, versioned
quote persistence with short DB phases, and generated-client checkout UI.
**Tech Stack:** NestJS/TypeORM/PostgreSQL/Zod, Next.js/React Query/Orval, Jest/Cypress,
agent-browser MCP headless.
**Spec:** ../specs/2026-10-30-shipping-quote-design.md

## Global Constraints

- One source, one parcel. Weight <=50000g, dimensions <=200cm, quote <=120 seconds.
- Server-only credentials, staging only, payer=1, COD=0, no create-order/payment.
- No provider request in a DB transaction; no private pickup in buyer responses.
- Keep existing worktrees untouched and DB CI behavior unchanged.

## Review Focus

Cancellation/expiry during network calls; pickup changed after quote; overlapping
refreshes; ambiguous carrier address names; partial failures/expired totals.

### Task 1: Parcel and provider contract

Files: common/schemas/shipping-package.schema.ts (aggregate export),
infrastructure/shipping/ghn-sandbox.adapter.ts, unit tests.

- [x] RED tests: two packages 300g 20x15x10 + 500g 30x20x15 => one 800g
      30x20x25 parcel; missing package and 50001g reject; order independence.
- [x] Implement aggregation and adapter; test canonical mapping/ambiguous names,
      malformed provider fees, fixed sandbox, sender payer and COD=0, heavy single item.
- [x] Run unit suite and one real staging preview with disposable fixtures.

### Task 2: Quote lifecycle

Files: checkout shipping quote schema/entity/service/controller/module and tests.
POST /checkouts/:id/shipping-quotes takes strict empty body and returns quote.
Checkout GET returns effective latest shippingQuote; old payloads default null.

- [x] RED HTTP/PG tests: ownership, two items one quote/parcel, missing config,
      source isolation, missing package/pickup, cancellation/expiry mid-call, overlap,
      pickup invalidation, TTL/fresh reuse and no public pickup fields.
- [x] Implement short prepare/publish transactions with provider outside, latest
      request pointer on Checkout and private inputs on quote records.
- [x] Run full HTTP/PG and unit regression, lint/typecheck/build.

### Task 3: Checkout UI and delivery

Files: generated OpenAPI clients, features/checkout shipping quote component,
CheckoutPage integration, Cypress spec, docs and AI log.

- [x] RED browser test: same seller's two items => one sandbox fee, scoped totals,
      reload persistence; missing setup and cancelled/expired state remain nonpayable.
- [x] Regenerate clients; add refresh/error/expiry UI, one parcel per source, sum
      totals only for a complete fresh quote; keep payment disabled.
- [x] Test real seeded PG/API + GHN sandbox with agent-browser MCP desktop/mobile;
      production build, Cypress, self-review, isolated BE/FE PRs and CI checks.

## Execution ledger

- Baseline: parent BE 629d0f6 and FE 64afd2e; previous 107 unit/97 HTTP tests passed.
- Confirmed configured staging token can read 34 provinces and owns documented
  pricing account. No token, carrier contact details or raw response is committed.

- 2026-10-31: 115 unit and 108 HTTP/PG tests pass; real sandbox Cypress passes.
- Final FE clock regression (RED/GREEN), production build and Cypress pass; agent-browser desktop/mobile screenshots and cancellation verified. BE PR #23 CI passed; FE companion is linked in the PR description.
