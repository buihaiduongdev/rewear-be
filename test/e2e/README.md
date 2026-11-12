# End-to-end tests

`rewear-commerce-flow.spec.ts` starts the full Nest `AppModule` and exercises a
single buyer/seller journey through HTTP: create a product, upload its images,
submit and approve it, add it to a cart, and hold it at checkout. PostgreSQL is
real; the auth guard and object-storage provider use test fixtures.

Run with `pnpm test:e2e`. Keep this suite focused on a few complete app flows;
put detailed service behavior in `test/integration` or unit tests.
