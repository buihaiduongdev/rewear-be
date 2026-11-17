# Backend module layout

Commerce modules follow the same grouping as `src/modules/product`. Main
controllers, services, module definitions and workers stay at the module root;
model and contract files are grouped by responsibility.

```text
src/modules/<feature>/
  constants/       # exported business values and named policy durations
  entities/        # TypeORM entities; table names remain explicit
  schemas/         # Zod validation and response schemas
  types/           # types derived from constants/schemas
  policies/        # pure payment/money/COD rules, where applicable
  utils/           # calendar calculations, where applicable
  <feature>.controller.ts
  <feature>.service.ts
  <feature>.module.ts
```

Each grouping provides an `index.ts`, as in Product. Type barrels use
`export type` and do not load entities or schemas at runtime. Existing internal
consumers use concrete file paths where this avoids loading unrelated files.

GHN infrastructure uses the same separation:

```text
src/infrastructure/shipping/
  adapters/ghn-sandbox.adapter.ts
  clients/ghn-shipment.client.ts
  constants/ghn-shipment.constant.ts
  schemas/ghn-shipment.schema.ts
  types/ghn-shipment.type.ts
```

Constant filenames use `.constant.ts`, matching existing Auth/Media naming.
Entities retain `.entity.ts`; recursive database entity discovery continues to
include them. Folder movement does not rename tables or change API routes.

Fixed durations use the existing `ms` dependency, for example `ms('24h')`,
`ms('75s')` and `ms('30d')`. There is no custom minute/hour multiplication helper.
The fixed Vietnam UTC+7 offset lives in Shipment calendar constants. Business
days are still calculated using the approved holiday calendar; `ms('2d')` is
not a replacement for two business days.

Tests, including isolated Node source loaders, resolve the real `ms` package.
The refactor does not mock duration parsing or add a new dependency.
