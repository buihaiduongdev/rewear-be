# COD orders and GHN Sandbox shipments

This slice extends the seller-acceptance backend. It does not implement all
COD fee, coin, settlement and operational decisions in DECISIONS.md.

## Place COD

`POST /api/checkouts/:id/orders/cod` requires Buyer JWT and body
`{ "expectedTotal": 230000 }`. This is the total the buyer reviewed, not an
authoritative price. Server obtains fresh shipping, validates money and the
remaining hold; changed totals return 409 before placing anything.

Placement is atomic/idempotent by checkout: one pending order per Shop,
`paymentMethod=COD`, `paymentId=null`, deadline 24 hours. Checkout becomes
`COD_PLACED` and products remain HELD with `reservedOrderId`; checkout's
10-minute expiry cannot release order-owned stock. Retrying the same total
returns the original orders even if subsequently cancelled. A still-unknown
MoMo attempt blocks switching to COD. A late MoMo capture is refunded through
the existing MoMo workflow without consuming the COD reservation.

Each buyer can have up to 3 pending COD checkouts, 20 pending items and 5 active
COD checkouts. Counters count distinct checkouts, not Shops. Exceeding a limit
does not create orders or change stock/cart. Existing checkout hold remains
subject to its original TTL until successful placement.

Existing Owner accept/reject endpoints apply to COD. Refusal/24-hour expiry
cancels only that Shop order and releases eligible stock owned by it; no cash
has been collected, so no wallet credit is created. Buyer can cancel pending
COD via `POST /api/orders/:id/cod/cancel` with `{ "reason":"CHANGE_OF_MIND" }`.
Buyer cancel and seller accept serialize; only one decision wins.

Five distinct self-cancelled COD checkouts in 24 hours trigger a 24-hour new-COD
restriction, then 72 hours on the next episode in 30 days, then admin review.
Replays/partial cancellations do not count the same checkout twice, existing
blocks are not extended and old trigger events are not reused after opening.
Prepaid buying and existing-order access remain available. Read these records
at `GET /api/cod/restrictions/mine`; Admin can resolve a record with a reason at
`POST /api/admin/cod/restrictions/:id/resolve`. Fee/delivery-fault restrictions
from future modules are separate; they are not claimed implemented here.

## Book, print and track

GHN shipment creation requires both `GHN_SANDBOX_ENABLED=true` and
`GHN_BOOKING_ENABLED=true` plus existing server-only Sandbox Token/ShopId.
Both flags default to false; preview does not automatically enable booking.
Hosts are fixed to GHN staging and redirects are rejected. Never expose the
account token, stored payload or sender/receiver transport snapshots to clients.

| Method | Route | Actor / input |
| --- | --- | --- |
| POST | `/api/shops/:shopId/orders/:id/shipment` | Owner, `{}` or `{parcel:{weightGrams,lengthCm,widthCm,heightCm}}` |
| GET | `/api/shops/:shopId/orders/:id/shipment` | Owner |
| GET | `/api/orders/:id/shipment` | Buyer |
| POST | `/api/orders/:id/shipment/reconcile` | Buyer, `{}`, subject to persisted lease |
| POST | `/api/shops/:shopId/orders/:id/shipment/label` | Owner, `{}`, returns temporary staging A5 URL |
| GET | `/api/admin/fulfillment/incidents` | Admin, up to 100 shipment/order review records |

Only preparing orders can be booked; accepting the order does not automatically
book or mean GHN picked it up. Snapshot buyer address, Shop pickup, original
parcel and optional actual parcel. COD collection is the fixed order total
including shipping; shipping payer is sender and failed-delivery collection is
zero. Carrier fee differences are recorded without altering the buyer's total
or automatically blaming/charging the seller.

Persist the request before HTTP. One shipment/client UUID per order is reused.
Unknown create outcomes remain locked and are queried by the original client
code; a retry does not make a second waybill. Not-found/timeout is not proof
that nothing was created. Automatic resubmission after unknown outcomes is
deliberately not performed; incidents require investigation rather than a new ID.

Authenticated detail queries verify client reference, GHN Shop, payer and
expected COD amount. A persisted 75-second lease prevents overlapping workers.
Each tick is bounded. GHN picked/in-transit status moves order to shipping;
delivered moves to delivered, returning moves to returns. Old snapshots cannot
regress the order from delivered. Loss, damage, return and contradictory data
are review cases, not automatic buyer fault, refund or stock release.

`deliveryObservedAt` records when Rewear observed delivered. GHN `updated_date`
is a last-update timestamp, not verified exact delivery event time. This slice
does not start 72-hour payout from that observation. COD collection/transfer
flags and dates are stored separately; delivered alone proves neither cash
collection nor receipt in Rewear's bank account.

## Cancel after seller confirmation

Buyer uses `POST /api/orders/:id/cod/cancellation-request` with `{}` before
observed pickup. Owner responds within 12 continuous hours at
`POST /api/shops/:shopId/orders/:id/cod/cancellation-response`, with
`{approve:boolean,reason:string,evidence:string}`. Pending requests block new
booking/label issuance. Timeout automatically approves the request.

A rejection keeps the block for 4 hours. Buyer can request Admin review at
`POST /api/orders/:id/cod/cancellation-review` with `{reason}`. Admin decides at
`POST /api/admin/orders/:id/cod/cancellation-decision` using the same decision
shape. Actions/actors/reasons/evidence are recorded in order history.

Approval without any booking cancels atomically. If a booking may exist, mark
CANCEL_PENDING and query/cancel GHN outside the transaction. Acknowledgement
alone does not unlock stock: require a verified cancelled snapshot and no
observed pickup/collection. Otherwise retain the reservation and flag review.
Thirty-minute unknown cancellation/creation incidents are marked by elapsed DB
time even when every carrier query fails; this does not claim notification or
Admin response SLA delivery.

## Explicit remaining work

- At 48 hours after COD seller acceptance, overdue unpicked orders require
  review and cannot create a new booking. Late-handover extension/buyer consent,
  full business-day Admin deadlines and their timeout transitions remain to be
  implemented; no unsafe automatic release or silent continuation substitutes.
- Carrier return/interception requests, returned-stock inspection and verified
  delivery event time need a further operational slice. A picked parcel is not
  automatically unlocked because cancellation was approved.
- Coin reservation/reward, failed-delivery fault decisions, disclosed fee
  collection/appeals, COD/bank reconciliation, wallet payment, 72-hour settlement,
  notifications and Admin frontend remain separate work.
- No unsigned webhook is trusted to change money/status; this implementation
  polls GHN with server credentials. No live GHN booking/collection/refund test
  has been performed. Test carrier responses are simulations, not proof of cash.
- Production migration/backfill is not performed. Tests use dedicated local
  `rewear_test`; development data is not reset.

## Provider contracts

- [Create](https://developer.ghn.vn/en/docs/order/create)
- [Detail by client code](https://developer.ghn.vn/en/docs/order/info-by-client-code)
- [Detail and COD flags](https://developer.ghn.vn/en/docs/order/info)
- [Cancel](https://developer.ghn.vn/en/docs/order/cancel)
- [Print](https://developer.ghn.vn/en/docs/order/print)
- [Status codes](https://developer.ghn.vn/en/docs/master-data/order-status)
