# Product lifecycle and API contract

Implemented on 27/10/2026. This covers listing drafts, images, publication/review
and editing rules. Checkout owns future reservation/SOLD transitions; this change
does not implement checkout, orders, payment or returns.

## Rules

- Drafts may omit category, title, condition, price and other content. Nullable
  fields are returned as `null`; send `null` to clear them. Blank titles are
  rejected if supplied; omit them or use `null` while saving an empty draft.
- Submission requires title, active category, condition, description, positive
  integer VND price, 3–10 images and one cover. Every image declares an angle;
  FRONT and BACK are required. LABEL is optional (a garment can lack its label);
  DETAIL and DEFECT are also supported. These photo/editing rules were confirmed
  by the user on 27/10/2026.
- The existing four condition values remain FAIR, GOOD, EXCELLENT and PRISTINE.
  `repairs` records repairs; each `defects` entry has a description and at least
  one `mediaId` belonging to this product. Drafts may reference an image removed
  during editing, but cannot be submitted until the evidence is repaired.
- Measurements are in centimetres: chest, waist, hip, length, shoulder, sleeve,
  inseam (positive, at most 500). Category admin create/update accepts
  `requiredMeasurements`, an array of those keys. Submission and approval check
  the category's current requirements. Existing categories default to `[]`;
  populate their requirements according to the garment categories in use.
- A personal seller may have at most 50 listings across PENDING_REVIEW, ACTIVE,
  HIDDEN and HELD. Drafts, rejected, suspended and sold listings are excluded;
  shop listings are excluded. Submissions serialize on the personal seller row.
- Only an active admin approves/rejects the current submitted revision. Rejection
  requires a reason. Any changed content/image increments revision, supersedes a
  pending submission, clears approval and takes the listing back to DRAFT.
  A price-only update on ACTIVE/HIDDEN retains approval, but requires price > 0.
- Seller hide/reactivate is limited to ACTIVE/HIDDEN with current approval.
  Seller cannot mark SOLD or release HELD. HELD, SOLD and admin SUSPENDED block
  content and image mutations. SUSPENDED is distinct from seller HIDDEN and
  cannot be reopened by the seller. Admin suspension has a separate audit event.
- Permissions retain the existing personal seller / active shop OWNER scope.
  Staff permissions remain unexpanded pending the shop role policy.

## Endpoints

All paths have `/api` prefix. Management endpoints require JWT. Admin routes also
require ADMIN; the service verifies active admin membership independently.

| Method | Path                                           | Purpose                                                       |
| ------ | ---------------------------------------------- | ------------------------------------------------------------- |
| GET    | `/products`                                    | Approved ACTIVE listings; filters/pagination/sort             |
| GET    | `/products/:id`                                | Approved ACTIVE detail                                        |
| GET    | `/products/me`                                 | Personal and owned-shop listings, optional status filter      |
| GET    | `/products/manage/:id`                         | Owned listing in any state                                    |
| POST   | `/products`                                    | Save a draft, including `{}`                                  |
| PATCH  | `/products/:id`                                | Edit owned content/price                                      |
| PATCH  | `/products/:id/status`                         | Hide/reactivate an approved listing                           |
| POST   | `/products/:id/submit`                         | Validate and submit current draft; HTTP 200                   |
| GET    | `/products/manage/:id/revisions`               | Owner review history and evidence                             |
| GET    | `/products/admin`                              | Admin queue, default PENDING_REVIEW                           |
| GET    | `/products/admin/:id`                          | Admin listing detail                                          |
| GET    | `/products/admin/:id/revisions`                | Admin evidence/review history                                 |
| POST   | `/products/admin/:id/moderation`               | `{ revision, decision: APPROVE / REJECT, reason? }`; HTTP 200 |
| POST   | `/products/admin/:id/suspend`                  | `{ reason }`; HTTP 200                                        |
| GET    | `/products/:productId/media`                   | Approved image revision, public                               |
| GET    | `/products/:productId/media/manage`            | Current images, owner only, including drafts                  |
| PATCH  | `/products/:productId/media/:mediaId/metadata` | `{ angle }`, owner only                                       |

Existing upload-ticket, confirm, reorder, cover and delete routes remain. Confirm
now accepts `angle`. Product list/detail also return `coverUrl`, `mediaCount`,
`measurements`, `repairs`, `defects`, `revision`, `approvedRevision` and new status
values. Size/color/brand filters perform case-insensitive exact matches.
Inactive categories, shops and personal sellers are excluded from public reads.

## Image integrity and concurrency

All listing mutations, image mutations, submission and moderation lock the same
product row in short PostgreSQL transactions. Revisions contain immutable content
and image metadata (including the storage ETag when available). Revision media
links retain referenced objects; removing an image from a listing does not delete
submitted evidence. Public image reads use the approved revision's links so a
concurrent edit cannot substitute unapproved images after the public lookup.

Upload tickets sign `If-None-Match: *`: the browser must send every returned
header, and bucket CORS must allow `If-None-Match`. This prevents reusing a still
valid ticket to overwrite an approved object. R2 documents atomic create-once
conditional PUTs in its [S3 API extensions](https://developers.cloudflare.com/r2/api/s3/extensions/).
This behavior needs a smoke test against the configured bucket before deployment;
local tests verify signatures and use a storage mock for network operations.

Failed confirms never delete objects: another confirm may already reference the
same key. Unconfirmed uploads remain available for retry; an orphan cleanup job
is not included. Unreferenced confirmed media are retired in the DB before the
object is deleted; their key remains unique and cannot be confirmed again.
Storage deletion failures are logged and preserve that retirement marker.
Revision evidence is retained indefinitely for now; no automatic purge is enabled
while retention and transaction snapshot policies remain open.

## Client integration and validation

Regenerate Orval from the updated backend's `/api/docs-json`. Draft fields are now
nullable and create-product has no required body fields. Public listings still
require complete content through submit/approval. Old ACTIVE rows without a
matching approved revision are intentionally not public; resubmit and approve
seed/demo data rather than bypassing moderation.

Dev schema follows the existing synchronize policy; no migration or dev DB reset
was run. Production migration/release preparation remains separate.

Use Node 24.9+ and the normal lint/format/typecheck/build/unit/HTTP commands.
To include the real PostgreSQL suite, create a disposable local database named
`rewear_product_test` and run:

```bash
PRODUCT_TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/rewear_product_test pnpm test:e2e --runInBand
```

The suite rejects non-local hosts and other database names, resets only that
explicit test database, and is skipped if its URL is absent. CI provisions
PostgreSQL 16 and sets the URL. JWT is replaced by a test identity guard in the
product HTTP tests; ownership, ADMIN role checks, validation, serialization and
persistence execute real application code. Storage calls are mocked.
