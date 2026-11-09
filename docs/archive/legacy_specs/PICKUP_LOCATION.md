# Private pickup locations

One current pickup address is stored per personal seller or shop, separately from
buyer delivery addresses. It is never added to public shop/product or checkout
responses. This stores configuration only; carrier registration, service
availability, quotes and shipment snapshots remain future work.

## API

All endpoints require an active user's JWT and return the normal envelope.

- `GET /api/shipping/pickup-location`: the current user's personal address.
- `PUT /api/shipping/pickup-location`: create or replace that address.
- `GET /api/shipping/shops/:shopId/pickup-location`: active OWNER membership required.
- `PUT /api/shipping/shops/:shopId/pickup-location`: same owner requirement.

Responses contain `{ location: <address> | null }`; null means not configured.
PUT returns 200 for first save and replacement, requiring the complete body:

```json
{
  "contactName": "Pickup contact",
  "phone": "0912345678",
  "addressLine1": "45 Test Street",
  "provinceCode": "01",
  "wardCode": "00004"
}
```

Text trims before validation. Name is 1–100 characters, street 1–255, phone 8–15
digits with an optional leading +. Canonical province/ward names come from the
server, which rejects mismatched codes. Vietnam only; unknown fields, client
source IDs and administrative names are rejected. Standard codes remain separate
from future carrier identifiers. No carrier credentials or identifiers are accepted.

Staff, inactive/former owners and unrelated users cannot access shop pickup data.
ADMIN does not bypass ownership here. An active owner may configure an inactive
shop, which does not activate that shop or shipping. Personal and shop data remain
independent. No arbitrary-user-ID read or delete endpoint is provided.

## Consistency and limits

Database constraints require exactly one user/shop source and one record per source;
parent deletion cascades. PUT locks the User or Shop row to serialize concurrent
first saves; shop membership remains read-locked through commit. Full writes are
atomic, with later writes replacing earlier ones. Optimistic edit conflicts are
not implemented. Future shipments must snapshot their pickup address independently
and preserve that snapshot when the current address changes.

The table follows the development synchronize policy; no shared database reset or
migration was applied. CI skips database tests unless explicitly configured and
does not gain a PostgreSQL service.

## Verification

```bash
PICKUP_TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/rewear_pickup_test pnpm test:e2e --runInBand --runTestsByPath test/pickup-location.e2e-spec.ts
```

Eight HTTP/PostgreSQL cases cover auth, ownership, inactive membership, privacy,
validation/canonical names, concurrent writes and database constraints. They use
a unique schema and fixture identity guard; browser QA uses real JWT/API traffic.
Full local regression passed with `--testTimeout=30000` after a resource-heavy
run hit the default hook timeout during schema reset; no service change was needed.
