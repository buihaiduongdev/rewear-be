# Post-adjudication returns, safety waivers and carrier remedies

Extends PR49's exact wallet refund engine with DECISIONS.md RETURN rules. One
return obligation per order/product remedyKey prevents multiple issues creating
multiple mandatory returns for the same item. Original final decisions remain
immutable; execution facts and per-item adjustments are separate records.

## Discovering and completing a return

GET /api/dispute-final-decisions/:finalId/refund includes returnCase.id after the
refund worker creates the obligation. It remains pending before a valid label.
Party GET /api/dispute-returns/:id and Admin GET /api/admin/dispute-returns/:id/review
show safe evidence/link/event history; GET never advances clocks or writes state.

Admin POST /api/admin/dispute-returns/:id/booking accepts requestId and actual
parcel (weightGrams/lengthCm/widthCm/heightCm). The backend reverses the immutable
forward shipment route, rather than using a newly edited address book or allowing
a caller-supplied raw provider payload. It creates a separate parcel with zero COD,
platform/Shop-account fee payer and no buyer advance. The current provider is GHN
Sandbox, always tagged SIMULATION. The original sale parcel is not repurposed.

The GHN create/detail contract is documented at
[GHN create](https://developer.ghn.vn/vi/docs/order/create) and
[GHN detail](https://developer.ghn.vn/vi/docs/order/info). payment_type_id=1 selects
the Shop account; this code does not claim that a live account contract or prepaid
funding has been verified. Account/route/client/waybill/COD/payer checks remain
mandatory before publishing a usable label. Public DTOs omit raw payload, account
credentials and request fingerprints.

- POST /api/admin/dispute-returns/:id/booking/refresh with {} reconciles the saved
  client code. UNKNOWN/CREATING outcomes query only, never blindly create again.
- Party/Admin GET booking routes expose a safe booking snapshot; matching POST
  booking/print routes with {} obtain a fresh usable private carrier label URL.
- Admin POST booking/reissue accepts a new requestId/parcel only after matching
  carrier-confirmed cancellation and no physical movement. Old attempts, labels,
  routes and request IDs are archived, not overwritten. The new attempt has a
  distinct client code and active uniqueness prevents competing parcels.

A background scan reconciles active due bookings every30 seconds with a persisted
75-second query lease and keyset traversal; it never calls create for UNKNOWN.
A recovered cancelled creation that never published a label can be archived and
reissued after confirmation, without inventing a buyer deadline.

Network calls occur outside transactions. Confirmed unusable pre-handover labels
pause the clock; replacement preserves the remaining time with at least24 hours.
A cancellation first observed after an already elapsed deadline cannot grant a
fresh day automatically. Conflicting physical movement needs explicit Admin review.
Booking status updatedAt is an observation, never invented exact pickup/delivery.

## Handover, evidence and authoritative clocks

A valid final decision plus usable label/instructions starts five continuous days
to hand over; it is not a deadline for the parcel to reach Shop. No label means no
buyer clock. Exact-boundary handover is timely. Buyer endpoints under
/api/dispute-returns/:id:

- POST packing: requestId, reason, labelCode, evidenceIds. Item and labeled parcel
  photographs are required; related accessory photographs are accepted when
  applicable. Video is optional. Physical movement without photos is recorded with
  packingMissing, never automatically treated as buyer fraud.
- POST obstacles: reason and owned READY evidence. A timely evidenced report stays
  pending verification and prevents irreversible automatic expiry; it is not an
  approved pause. Active Admin VERIFY_OBSTACLE checks the effective incident time.
- POST objections: Owner-only, matching return label plus parcel/label/received
  item photographs. A clear unboxing video is helpful but not mandatory.
- POST accept-inspection: Owner confirms an inspected return, satisfying receipt
  without forcing the system to wait for a needless response timeout.

Admin POST /api/admin/dispute-returns/:id/:action uses exported actions
VERIFY_OBSTACLE, REJECT_OBSTACLE, RESUME, HANDOVER, DELIVERY, EXTEND, RESOLVE,
RECOVER_HANDOVER. Mutations carry requestId/reason and action-specific proof,
mode, labelCode, observedAt, reviewToken or refundLimit. They are immutable-event
and payload-idempotent; foreign/unready evidence and wrong modes/labels conflict.

Verified obstacle pauses from obstacleAt, not the later administrative verification
time. Resuming preserves remaining time with a minimum24 hours. A verified physical
handover during that effective pause moves to transit; a shipped parcel cannot be
put back into the awaiting-handover state by RESUME.

A technical expiry closes only the unexecuted refund as CLOSED_NO_REFUND and the
related issue, with no wallet credit or false refund-success message. Other issue
holds remain. Verified historical timely handover recorded later sets a review flag;
RECOVER_HANDOVER needs an active Admin, fresh review token and matching proof/mode/
label before reopening only that technical closure. It does not revise the original
merits decision. Cancelled-label conflicting movement follows the same explicit
review requirement; no automatic monetary reopening.

## Shop inspection and per-item objections

Exact verified carrier delivery starts two approved Vietnam business days, excluding
the delivery day and ending17:00 Vietnam. Missing calendar coverage remains held.
No timely objection after that deadline satisfies the receipt prerequisite. An
Owner's evidenced objection starts a separate3-business-day review, extendable once
with a reason to at most5 business days from the original objection. Overdue review
is flagged/notified; it does not invent a winner or keep resetting the clock.

Admin review tokens include item/parcel state and linked proof IDs/readiness/ETags.
INCONCLUSIVE or FULL_REFUND rejects the objection and continues the original refund.
BUYER_FAULT needs evidence and a nonnegative refundLimit no greater than that item's
original approved amount. Other items are not rejected as a group. A zero entitlement
closes without a wallet credit. Positive limits retain exact per-item commission
rounding and duplicate-remedy protection from the existing refund engine.

## Safety waivers

Admin POST /api/admin/dispute-final-decisions/:id/safety-waiver records mode,
UNSAFE/NON_TRANSPORTABLE basis, verified evidence, reason and concrete disposal/
handling instructions. High return price alone is not a safety basis; the existing
Shop-consent waiver remains a separate route. Closed/expired returns cannot be
revived through a new safety authorization.

Buyer POST /api/dispute-final-decisions/:id/safety-waiver/execution submits a
statement and owned READY evidence produced after the recorded instructions.
Admin POST the corresponding /api/admin/.../safety-waiver/verify needs the fresh
exception review token and substantive verification. An instruction or buyer claim
alone never satisfies execution. Safety fulfillment cannot override an already
verified per-item buyer-fault limit. The resulting prerequisite feeds automatic
wallet execution; there is no extra generic disbursement approval.

## Carrier loss, damage and unjustified Shop refusal

Admin POST /api/admin/dispute-final-decisions/:id/carrier-exceptions records the
fresh reviewToken, direction OUTBOUND/RETURN, kind CARRIER_LOSS/CARRIER_DAMAGE/
SELLER_REFUSAL, exact waybill/mode, occurredAt, reason, disposition instructions
and order-bound READY evidence. Return exceptions require verified timely handover;
delay alone is not loss. Outbound claims require the final carrier-liability finding
and original waybill. These are explicit verified findings, not buyer-ready flags.

Verified return loss/damage belonging to the carrier, or unjustified refusal of a
valid return, can satisfy the buyer's duty without waiting for carrier compensation.
The instructions retain responsibility for handling the parcel. Original amount
limits, source modes and any required bilateral partial-agreement consent remain
additive; an exception cannot bypass them.

Carrier compensation is independent from buyer refund. Shop is never guaranteed
its retail price or advanced an unreceived award:

- POST /api/admin/carrier-compensation-claims/:claimId/acknowledgement records
  immutable actual acknowledged amount, conditions and evidence. It pays nothing.
- POST the same claim's /receipts records actual CASH or VERIFIED_NETTING with
  mode/reference/amount/receivedAt/evidence. Total cannot exceed the acknowledgement.
  Claims for different shipment legs are allocated by exact claim ID.
- CASH receipts alone increase the Shop's available compensation. VERIFIED_NETTING
  requires a linked chargeId from the same item/order/Shop/mode, is capped at its
  unpaid verified amount, and reduces that debt without creating spendable cash.
- References are normalized consistently and cannot also fund COD remittances or
  another compensation receipt. Source and simulation isolation are preserved.

Admin POST /api/admin/dispute-final-decisions/:id/return-shipping-charges records
actual verified standard return cost for a seller-fault finding, or extra refusal
cost only after verified unjustified refusal. It is a same-source immutable liability,
not a buyer upfront charge, arbitrary penalty or deduction from another order.
Shop finance exposes carrierCompensation, returnFeePayable and safe histories.
General fee collection/payment/disputes remain the separately listed fee module;
this slice does not silently collect that debt from unrelated money or bank accounts.

Party/Admin GET /api/(admin/)dispute-final-decisions/:id/return-exceptions provides
safe waiver/claim/receipt/charge history and a review token. Evidence download follows
existing private evidence rules: parties see only submitted attachments, Admin can
inspect relevant proof, storage keys/ETags/bank references stay out of public DTOs.

## Verification and deployment boundaries

Pure clock/provider tests, PostgreSQL state/ledger tests and real JWT HTTP permission/
privacy tests exercise ordinary returns, pause recovery, expiry, calendar gaps,
objections, buyer-fault reductions, safety verification, independent compensation,
netting and confirmed-cancel booking recovery. All provider responses are mocks;
no live GHN booking, bank transfer or production SLA is asserted.

TypeORM synchronize is the project's current DB setup. No production migration,
historical financial repair or development database reset is included. The worker
polls returns through pending refund conditions; tests invoke scans explicitly to
avoid racing fixtures. Payment/return evidence modes must match before money moves.
