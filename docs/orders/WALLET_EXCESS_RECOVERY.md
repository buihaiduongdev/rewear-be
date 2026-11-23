# Wallet excess credit recovery

Implements the `WALLET-REFUND-EXCESS-VERIFY-01` and `WALLET-EXCESS-*` decisions. This is correction of a proven excess refund, not a penalty, wallet top-up or automatic finding of buyer fraud. No repayment due date or purchase restriction is introduced.

## Verification and accounting

An active Admin selects an existing cancellation wallet credit, dispute refund credit or successfully completed buyer fee wallet refund. The server derives buyer, original credited amount and evidence/simulation mode from that ledger. The Admin records the verified correct entitlement (`authorizedAmount`), reason and evidence references. Evidence text documents the review; it is not a remotely fetched URL or automatic proof of the decision. One case exists per source, and all later corrections update that case with version checks and audit history. Original credits remain immutable.

Liability equals original credit minus correct entitlement. Collections and correction returns are separate immutable entries. `collected` is gross; `returned` includes queued original-source returns; `net` is collected minus returned. `reserved` is verified MoMo capture waiting for an objection decision. `outstanding` excludes net collections and these reserved amounts. Provider refund state separately distinguishes money still returning from verified completion.

Verification can immediately debit the unspent excess from available, provenance-backed wallet funds. Existing checkout spending lacks per-credit allocation, so initial recovery conservatively treats all previous checkout/fee/recovery debits and current holds as consuming this source first. It may leave more to future recovery rather than assume another credit is unused surplus. Held money and captured purchases are never changed. If excess has been spent, the remaining liability stays separate without negative wallet balance or negative backing.

New wallet refunds from cancellation, disputes and buyer fee refunds offset outstanding eligible cases in original verification order, with id as stable tie-breaker. Each refund source is processed once in its credit transaction, including when fully offset; replay cannot debit again. Evidence and simulation pools never mix. Open objections are skipped; refunds received during review remain available and are not retroactively swept when review ends. Wallet correction returns and released checkout holds are not new refund sources for this offset policy.

## Buyer objection and Admin correction

- Buyer may object once to each recovery decision within seven continuous days of its notification, supplying a specific error/evidence reference. Submission immediately pauses offsets and new MoMo payment creation for that case.
- Review is due17:00 Vietnam on the second approved business day, excluding receipt day. Shared approved fulfillment calendars supply closures; a missing year leaves the deadline pending calendar configuration and does not block an objection. Worker calculates from original receipt when the calendar becomes available.
- If overdue, collection remains paused. Durable buyer/Admin alerts record the incident; Admin must update handling within one business day from alert, excluding alert day and ending17:00. Response records the accepting Admin, explanation and next update time. No timeout automatically accepts/rejects an objection.
- Admin requires current case version, verified entitlement and reasons/evidence to resolve or correct an error. Full or partial acceptance automatically returns over-collected wallet money to wallet and queues MoMo money to its original capture. No second buyer request or separate refund approval is required.
- Buyer can explicitly confirm withdrawal before resolution; the objection closes and waiting MoMo capture settles first. A reviewed/withdrawn decision gets no extra default review round. A later independently corrected Admin decision has a new decision version/window; new objections reset escalation clocks. Admin can always correct a discovered error.
- Additional buyer evidence is accepted inside the same objection when requested by Admin. The request and response remain in history. This module accepts textual evidence references; it does not grant access to dispute/chat media or add a generic document-download capability.

## MoMo Sandbox and operational refunds

Only simulation liabilities can use the existing MoMo Sandbox adapter. Buyer selects own eligible case ids and confirms their exact current outstanding total. Small liabilities may be grouped for the same buyer; totals outside the shared provider range are refused without rounding up. Unknown attempts block overlapping new payments; offsets can continue while payment is pending, unless the case is objected.

IPN uses the existing `/payments/momo/ipn` endpoint and dispatches by a persisted recovery attempt id. Adapter signature, request id/order info, capture amount and globally reused checkout/fee/recovery transaction references are checked. Success cannot credit a wallet or create orders. Exact captures allocate only remaining liability; mismatch, duplicate or excess capture queues refund of the unused money to the original MoMo source.

An inflight success during objection reserves actual capture pending conclusion. That amount prevents further recovery of the same liability. On resolution/withdrawal, use only the amount still owed and queue any surplus back to MoMo. Corrected prior collections likewise return each part to its own collection method. Atomic commerce locking serializes offsets, captures, objections and corrections.

Attempts/refunds use durable two-minute query leases, longer than configured maximum single HTTP timeout. Refund submission alone never means completed: provider query must verify success. An ambiguous submission is queried with its original reference and never blindly resubmitted. Known submission failure/unsupported refund range triggers an immediate operational REVIEW alert; unresolved results alert after30 minutes, with a four-continuous-hour Admin response target. Those are Rewear operational targets, not MoMo completion guarantees. Unsupported/failed cases remain visible for operational investigation; this module does not fabricate external refund completion. Completed refunds are excluded from the active Admin queue. Completion sends a durable safe inbox notice.

## APIs

All buyer/Admin routes require a currently active account. Role and ownership checks are repeated on command replay. Another buyer or target Shop has no access.

| Method | Path under `/wallet/recoveries` | Purpose |
| --- | --- | --- |
| GET | `/mine`, `/:id` | Own summaries/details and public audit history. |
| POST | `/:id/objections` | Specific objection with requestId/reason/evidence. |
| POST | `/:id/supplements` | Requested additional evidence in current review. |
| POST | `/:id/objections/withdraw` | Explicit `confirmed:true` withdrawal. |
| POST | `/payments/momo` | Exact grouped Sandbox repayment, request replay protected. |
| GET | `/payments/:id` | Own payment, targets and original-source refund states. |
| GET | `/admin`, `/admin/:id` | Admin paginated queue and detail. |
| POST | `/admin` | Verify source/correct entitlement with evidence. |
| POST | `/admin/:id/corrections` | Version-checked correction/review decision. |
| POST | `/admin/:id/evidence-requests` | Explain additional evidence needed. |
| POST | `/admin/:id/responses` | Record handling, accepting Admin and next update time. |
| GET | `/admin/refunds` | Active provider refund incidents. |
| POST | `/admin/refunds/:id/responses` | Record refund handling and next update time. |

Lists use bounded limit/offset, stable ordering and repeatable-read snapshots. Buyer responses omit internal actor identity and provider request ids; Admin incident responses explicitly identify the accepting Admin as required by escalation. Schema-declared responses strip ORM relations/internal command fingerprints. Safe inbox notifications use WALLET_RECOVERY; no unsolicited external messages are sent by tooling.

## Verification and deployment

PostgreSQL tests use dedicated `rewear_test` serially: proven credit correction, replay, held/spent money, provenance, objection clocks, later-decision escalation, requested supplements/withdrawal, offsets, capture races, duplicate/mismatch refunds and ambiguous provider responses. HTTP/schema tests cover permissions, strict inputs, serialization, existing IPN dispatch and OpenAPI. Provider tests use fakes. Local full app checks require main's xstate dependency; final PR CI records integrated build/typecheck/test evidence.

Apply schema through the project's deployment procedure; tests do not migrate/reset a developer database. Configure approved calendars and MoMo Sandbox before live end-to-end verification. Frontend wallet notices/objection forms/Admin queues and real provider account testing remain separate work. This branch does not require or merge Reports PR58.
