# Vietnam administrative division snapshot

This module bundles a versioned two-level Vietnam administrative division snapshot so API requests do not depend on an external service.

- Effective date: 2026-10-18
- Scope: 34 province-level units and 3,321 ward-level units
- Province names/types: checked against the General Statistics Office administrative directory
- Ward names/types and hierarchy: Province Open API v2, cross-checked with `open-admin-data/vietnam-administrative-divisions`
- Known official correction retained: Ba Chẽ ward code `06970`

Sources:

- https://danhmuchanhchinh.nso.gov.vn/
- https://provinces.open-api.vn/api/v2/redoc
- https://github.com/open-admin-data/vietnam-administrative-divisions/tree/54cdb052284b02e75dfaa44089ca383aa12c57db

When the official directory changes, regenerate the snapshot, review code/hierarchy differences, update `effectiveDate`, and run the administrative division unit tests.

The follow-up plan for moving this generated dataset out of TypeScript is tracked in [`docs/TODO.md`](../../../../docs/TODO.md).
