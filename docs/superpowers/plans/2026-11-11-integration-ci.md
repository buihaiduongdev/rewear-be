# Integration CI Implementation Plan

> Execute inline using superpowers:executing-plans; verify with superpowers:test-driven-development and superpowers:verification-before-completion.

**Goal:** Run every backend integration test in CI against disposable PostgreSQL, using the same DB configuration variables as demo2.

**Spec:** User-approved approach in this conversation: CI owns the test database; dev Compose creates only `rewear`; missing database configuration must fail rather than skip.

**Architecture:** A shared test helper validates `DB_*`, requires a local `rewear*_test` database, and gives every database suite an isolated schema. Jest discovers unit and integration tests together; focused scripts select either group.

**Tech Stack:** Jest 30, TypeORM, PostgreSQL 16, GitHub Actions.

## Constraints and review focus

- Do not connect integration tests to the development database or fall back to `DATABASE_URL`.
- Fail on missing configuration or unavailable PostgreSQL; retain all existing test cases.
- Product schema resets must not affect another suite sharing the database.
- Drop suite schemas after success or setup failure; retain the dev volume and user-created Graphify artifacts.
- Preserve PR #28 metadata, four AI assistance fields, and Swagger evidence.

## Tasks

1. [x] Add tests for missing/unsafe DB configuration, explicit connection options, and schema isolation. Observe failure before implementing the shared helper.
2. [x] Rename HTTP/database suites under `test/integration`, switch all five database suites to the helper, and remove URL-dependent skips. Run against one temporary PostgreSQL database, including concurrent suites and failure without configuration.
3. [ ] Configure CI PostgreSQL and `DB_*`, make `pnpm test` run both groups, remove dev initialization SQL, update current docs and AI log. Review, run all quality gates, push PR #28, and verify CI executes all tests with zero skips.
