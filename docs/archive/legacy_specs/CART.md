# Cart API

Implemented in `feat/cart`, based on the product/seed contract from PR #18.
All paths have the `/api` prefix and require JWT. No frontend files are changed.

| Method | Path                     | Response                                     |
| ------ | ------------------------ | -------------------------------------------- |
| GET    | `/cart`                  | HTTP 200, current user's grouped cart        |
| PUT    | `/cart/items/:productId` | HTTP 200, grouped cart after adding/retrying |
| DELETE | `/cart/items/:productId` | HTTP 204, empty response                     |

PUT accepts no body or `{}`. Unknown fields, including `quantity`, `price`,
`userId` and `cartId`, are rejected. Product IDs use UUID validation. Owner identity
comes only from authentication. DELETE is idempotent, scoped to the current user
and works even when the listing is no longer purchasable. Reading an empty cart
or deleting from an absent cart creates no database row.

## Rules and consistency

- Each account has at most one cart; each product appears at most once per cart.
  PostgreSQL unique constraints enforce both under concurrent first additions.
  Retrying PUT preserves the existing item and its `addedAt` timestamp.
- Different buyers can save the same product. Cart does not change product status,
  reserve inventory, start a hold timer, create orders or contact storage/carriers.
- New additions require ACTIVE, current approval, an approved revision record,
  an active category and active personal seller/shop. An unavailable product
  returns 409; a missing product returns 404. Repeating an addition after the
  product becomes unavailable returns 409 and preserves the existing saved item.
- Adding a personal seller's own product or a product of a shop they actively own
  returns 403. Reading rechecks ownership: a buyer who becomes the shop owner
  sees OWN_PRODUCT. Staff buying is not additionally restricted in this change;
  broader shop/staff policy remains separate.
- A short-lived shared product row lock serializes add checks with product edits,
  review, image changes and future reservation writes. It is released when the
  add transaction commits; it is not a business reservation.
- GET uses one REPEATABLE READ transaction for items, source eligibility, current
  prices, approvals and cover images, so the response and total share one snapshot.
  Sources, approvals and covers are fetched in batches rather than per item.

## Response

The existing `{ statusCode, message, data }` envelope is preserved. `data` has:

```json
{
  "groups": [],
  "summary": {
    "itemCount": 0,
    "availableItemCount": 0,
    "totalPrice": 0,
    "currency": "VND"
  }
}
```

Each group contains `source: { type: "USER" | "SHOP", id, name }` and `items`.
Each item contains `productId`, ISO `addedAt`, `availability` and `product`.
The product summary contains `id`, `title`, current integer VND `price`,
`condition`, `size`, `color` and `coverUrl`. Cover images come from retained
approved-revision links, never a current unreviewed image list.

| Availability | Product data     | Included in total |
| ------------ | ---------------- | ----------------- |
| AVAILABLE    | Approved summary | Yes               |
| HELD         | Approved summary | No                |
| SOLD         | Approved summary | No                |
| OWN_PRODUCT  | Approved summary | No                |
| UNAVAILABLE  | `null`           | No                |

Draft, pending, rejected, hidden or suspended listings, revision mismatches,
missing approval records and inactive categories/sources become UNAVAILABLE.
Their current unpublished title, price, images and seller information are not
returned. These items appear together in the group whose `source` is `null`.
The saved product ID and added timestamp remain available for removal.

`itemCount` includes every saved item; `availableItemCount` and `totalPrice`
include only AVAILABLE items. The total is a current merchandise subtotal, not
a shipping/payment quote or price guarantee. Empty carts have no groups and zero
counts/total. Items are read newest first, with an ID tie-breaker; groups follow
the first occurrence of their items.

GET does not remove unavailable items. CHECKOUT-01 removal and final availability,
self-purchase and price checks belong to checkout. Selection of a subset of
`productId`s stays with the client until a future checkout request; this API does
not auto-select the whole cart or persist a checkout selection.

## Database and verification

New tables are `carts` and `cart_items`, using the existing dev synchronize policy.
No dev database was reset, no migrations were run and no new dependency is needed.
Hard deletion of an account removes its cart/items; hard deletion of a product
removes its cart references. Existing product APIs use status transitions, so
status changes retain the item and report availability on the next read.

With Node 24.9+, the usual lint/format/typecheck/build/unit checks apply. The cart
HTTP/PostgreSQL suite requires a dedicated local database named exactly
`rewear_cart_test` and uses a unique schema, cleaned up at the end:

```bash
CART_TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/rewear_cart_test pnpm test:e2e --runInBand --runTestsByPath test/cart.e2e-spec.ts
```

It skips when the URL is absent and rejects other hosts/database names before
creating any schema. CI creates the test database and sets the URL. Tests load
the real CartModule and TypeORM providers, validation and serialization; only JWT
is replaced by a test identity guard. They verify concurrent adds, buyer isolation,
self-purchase checks, current prices/grouping, stale-state privacy, source eligibility,
concurrent product status changes, idempotent removal and OpenAPI.

Set `CART_OPENAPI_OUTPUT` to export the cart contract during the suite. Full app
OpenAPI continues to be served at `/api/docs-json`; regenerate Orval before
integrating cart hooks into the frontend. Browser FE/BE and real JWT integration
remain separate acceptance work.
