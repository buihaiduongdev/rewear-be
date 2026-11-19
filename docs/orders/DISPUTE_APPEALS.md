# Dispute appeals and final conclusions

Implements DISPUTE-APPEAL01?09 in submission_docs/DECISIONS.md. Each buyer and
Shop Owner may request review once per original issue decision. The original
decision, its evidence basis, item-price ceiling and remedy key remain immutable.

## Submission and private evidence

POST /dispute-decisions/:id/appeals accepts requestId, reason, specificError
(nullable) and evidenceIds (at most ten unique IDs). A concrete error or new
READY evidence is required. Evidence must belong to the submitting user and
order. New IDs are checked against the original decision basis; substantive
novelty and credibility remain the reviewing Admin's assessment.

The window is two business days from the original durable notice, excluding
notice day, weekends and approved Vietnam holidays, ending at 17:00 Vietnam.
Filing exactly at the deadline is accepted. Both parties share that deadline.
If calendar coverage is unavailable, the request is recorded PENDING_CALENDAR
with its original filedAt. Recovery classifies it ACCEPTED or OUT_OF_TIME
against the original verified deadline; it never restarts the filing clock.
A pending receipt is not a promise of eligibility.

Request IDs are immutable and idempotent; changed input conflicts. Buyer and
Owner access follows the order's existing ownership policy. Separate appeal
attachment records allow the counterpart to read submitted proof without
changing original attachments. Unsubmitted private files remain inaccessible
to the counterpart. Public views exclude hashes, storage keys and ETags.

## Combined Admin review

- GET /admin/dispute-decisions/:id/appeal-review reads a consistent combined
  review and freshness token without changing state.
- POST /admin/dispute-decisions/:id/appeal-review/refresh with {} explicitly
  reconciles calendar, eligibility, clocks and unappealed finalization.
- POST /admin/dispute-decisions/:id/appeal-decision accepts the initial decision
  fields plus sameAdminReason (nullable). A fresh combined reviewToken is required.

All Admin endpoints require global authenticated access and ADMIN role. Final
writes also require an active Admin account. Both accepted requests are reviewed
together. Admin must wait until the entire common filing window has ended,
even when both parties submit early. Another active Admin must review where
available. The original Admin may act only when no other active Admin exists
and an explicit exception reason is recorded.

Review is due two business days after the filing window ends. There is no
ordinary extension. The worker flags overdue review and escalates with a
one-business-day target; funds remain held and no party wins automatically.
Missing calendar coverage remains visible and preserves all holds.

## Finality and financial boundaries

A final record is immutable, idempotent and permits no further appeal on the
same issue. If no accepted appeal exists after the verified window, the worker
copies the original outcome as ORIGINAL_UNAPPEALED; it does not make a new merits
decision. An accepted appeal requires an explicit Admin conclusion.

REJECT_CLAIM resolves the issue as RESOLVED_NO_REFUND. The case closes and restores
the previous order state only when all other issue holds are clear. UPHOLD_CLAIM
and REQUIRE_RETURN remain AWAITING_EXECUTION and continue blocking settlement.
Missing-item claims cannot require return; return requires seller responsibility.

This slice does not refund wallets, transfer money, create return labels, inspect
returned goods, adjust fees or pay sellers. Item ceilings are not additive refund
amounts; execution must deduplicate remedies by the original remedyKey.

## Verification

Tests use the dedicated local PostgreSQL test database, real application/JWT HTTP
routes and mocked private storage URLs. They cover replay/races, party limits,
cutoff and calendar recovery, combined review, reviewer independence, evidence
privacy, overdue holds, transactional rollback and multi-issue case restoration.
No live MoMo, GHN or object-storage integration is claimed.

## Wallet refund execution update

[Exact-amount refund execution](DISPUTE_REFUNDS.md) now queues final plans, credits eligible wallets and adjusts seller settlement. Return/safety/carrier prerequisites remain pending until their own verified workflows are implemented.
