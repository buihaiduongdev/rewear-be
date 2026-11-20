# Dispute intake, evidence and party responses

This slice implements intake and financial holds, private photo/video evidence,
party responses and review SLA tracking. [Initial Admin adjudication](DISPUTE_ADJUDICATION.md)
records decisions and appeal windows separately. [Appeals and final conclusions](DISPUTE_APPEALS.md)
are implemented. [Verified returns](DISPUTE_RETURNS.md), [wallet refunds](DISPUTE_REFUNDS.md)
and [wallet checkout/manual Shop payouts](WALLET_CHECKOUT_AND_PAYOUTS.md) provide the downstream workflows.
No automatic winner or refund is inferred from video, silence or elapsed SLA.

## Intake and money

`POST /orders/:id/dispute/issues` (buyer only):

```json
{
  "productId": "an-item-UUID-from-this-order",
  "kind": "WRONG_ITEM",
  "description": "Explain how the received item differs from the listing",
  "evidenceIds": []
}
```

Kinds: WRONG_ITEM, NOT_AS_DESCRIBED, MISSING_ITEM and TRANSIT_DAMAGE.
One case per order, one issue identity per product/kind. Different items or
problem kinds can be added during the same original 72-hour window. Duplicate
identity returns the original issue without replacing its description or timers;
updates go through supplementation/replies. There is no delete/reset endpoint.

Verified delivery and its snapshotted deadline from the settlement workflow are
required. Intake is allowed before that deadline, including early-completed
orders. At the exact deadline, intake is closed and settlement may proceed.
All state changes use the same commerce advisory lock and read the database
clock after acquiring it. Another buyer, another order's product, already
released funds and missing/mismatched delivery windows are rejected.

Opening even an incomplete issue sets the order to dispute and blocks the
entire seller amount for that order. The settlement service additionally queries
open issue records directly, protecting against an accidentally changed order
status. Other orders remain independent.

## Minimum evidence and the 24-hour allowance

- Wrong item/not as described: photo or video tagged ISSUE.
- Missing item: evidence covering PARCEL, LABEL and RECEIVED_ITEMS.
- Transit damage: evidence covering PARCEL, LABEL and DAMAGE.

These tags identify the uploader's declared coverage, not automated recognition
of the image contents or a decision about fault. One file may cover multiple
tags. Clear unbox videos can support the buyer's account; video is not mandatory
and never automatically wins a dispute. Admin must assess the actual files.

An issue without these minimums remains NEEDS_EVIDENCE and holds funds for one
24-continuous-hour allowance from first intake, not from the end of the 72h
window. `POST /dispute-issues/:id/evidence` with `{ "evidenceIds": [...] }`
attaches confirmed, uploader-owned files. Existing pending issues can become
valid after the 72h window if still inside their original allowance. Sending
more requests does not restart either clock. Ready buyer evidence only can
satisfy the buyer intake minimum.

The worker closes expired incomplete issues as CLOSED_INCOMPLETE, records
history/notices, and restores the previous order state only if no other issue
is open and the order is still dispute. It does not overwrite a cancellation
or return state. Closing incomplete evidence is not a decision of fault.

## Private uploads and reading

1. `POST /orders/:id/dispute-evidence/uploads` with mimeType, sizeBytes and tags.
2. PUT the actual file to uploadUrl using the returned required headers.
3. `POST /dispute-evidence/:id/confirm` with `{}`.
4. Submit the ready evidence ID in intake, supplementation or a reply.
5. `GET /dispute-evidence/:id/download` obtains a five-minute signed read URL;
   send the returned If-Match header. Admin uses the separately guarded
   `GET /admin/dispute-evidence/:id/download`.

Allowed formats: JPEG, PNG, WebP and MP4; images up to 10MiB and videos up to
100MiB. There are at most 30 lifetime tickets per uploader/order, including
abandoned tickets. Requests use at most 10 files. Upload tickets last 15 minutes.
The buyer can upload during intake/supplementation or an active case; an active
Shop Owner can upload once an issue is valid. Revoked/non-Owner members cannot.

Files use a separate private bucket, never product media/public URLs. Signed
conditional PUT prevents object replacement; confirmation checks HEAD size,
MIME and ETag outside database locks, then rechecks permissions and expiry under
the lock. Content metadata does not prove the bytes are safe or the photo is
truthful. Malware/content classification is outside this slice. READY replay
does not resubmit evidence or restart deadlines.

Only uploader, authenticated case counterpart (after submission) and Admin
can obtain reads. A party cannot inspect the other party's unsubmitted files.
Views serialize safe metadata and do not expose bucket/key, ETag or unrelated
carrier/bank proof. Signed URL holders can access until its short expiry, so
URLs must not be logged or made public.

### Storage configuration

Set optional STORAGE_PRIVATE_BUCKET to a separate bucket with public access
disabled. It uses the existing storage endpoint/credentials. Missing, invalid
or public-equal configuration returns 503 on upload/read rather than falling
back to public storage; app startup still works. Configuration failures do not
consume upload tickets. Operators must enforce private bucket policy and CORS
for the PUT/GET/HEAD headers. Signing alone cannot verify bucket policy. Browser
uploads must use the actual Blob/File body so automatically supplied length
matches the signed length. No live storage or provider integration was tested.

## Party replies and Admin SLA

`POST /dispute-issues/:id/replies` accepts requestId (UUID), text and evidenceIds.
Buyer and active Owner can respond to ACTIVE issues. Reply IDs are idempotent;
changed replay conflicts. Text, actor, timestamp and attached IDs are retained.
Late seller replies are accepted, marked late, and do not extend review SLA.

Each issue starts its own SLA at validAt, immediately when minimum evidence is
submitted. Durable buyer/Shop/Admin notices are created in that transaction.
Shop notice time starts the one-business-day seller response window. A late
reply before a worker scan still counts as missed deadline. If the approved
calendar is unavailable, lateness is null; later recovery derives it from the
original reply timestamp without changing content or resetting the deadline.

Admin review: three business days, excluding submission day and configured
Vietnam holidays, ending 17:00 Vietnam time. Waiting for parties does not stop
the clock. `POST /admin/dispute-issues/:id/extend` requires a reason and allows
one extension to the original five-business-day bound, not five days from now.
No repeated extension resets it. Missing calendar is recorded explicitly and
recalculated from original timestamps once approved coverage exists.

The worker flags overdue review; after the five-day maximum it records
escalation with a further one-business-day decision target. Funds remain held;
silence and timeout never accept/reject the claim automatically. The actual
initial decision workflow is documented in [DISPUTE_ADJUDICATION.md](DISPUTE_ADJUDICATION.md);
appeals are documented in [DISPUTE_APPEALS.md](DISPUTE_APPEALS.md); financial execution remains future work. Durable notices
are available in the case read API; email/push delivery is not implemented.

## Read APIs and test scope

- `GET /disputes/mine`: buyer's cases.
- `GET /shops/:shopId/disputes`: active Owner's Shop cases.
- `GET /orders/:id/dispute`: buyer/active Owner detail.
- `GET /admin/disputes` and `GET /admin/disputes/:id`: Admin queue/detail.

Lists, message and notice histories support offset and 100-row pages. Detail
includes issue-specific deadlines, shared submitted files, replies and relevant
audience notices. Multiple issues never reset each other's deadlines.

Tests cover dedicated PostgreSQL transactions/holds, HTTP JWT/privacy/ownership,
missing evidence/calendar recovery, reply/SLA clocks, idempotency/concurrency,
rollback and cutoff after lock wait. Storage I/O is mocked; signed command
contracts are tested separately. No real MoMo/GHN/R2 execution is claimed.

## Post-adjudication return update

[Returns and verified exceptions](DISPUTE_RETURNS.md) now provide reverse booking, handover/inspection/objection clocks, safety execution verification, carrier loss/refusal remedies and independent evidenced compensation. These feed exact wallet refund conditions; no live provider or external bank payment is claimed.
