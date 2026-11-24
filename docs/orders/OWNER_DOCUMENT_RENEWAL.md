# Owner document renewal

Implements SELLER-REG-10..19 after initial Shop approval. This is manual document review, not an external identity verification service. Fraud investigations and identity appeals remain separate work.

## Deadlines and decisions

- The document remains valid through its expiration date in Vietnam. Grace lasts the next 30 complete calendar days. For expiration 2026-10-01, the restriction boundary is 2026-11-01 00:00 Asia/Ho_Chi_Minh.
- A complete submission before that boundary preserves new-sale eligibility while awaiting Admin review. A late submission alone does not reopen sales.
- Admin NEEDS_INFO requires IMAGE_QUALITY. The first request starts seven continuous days; later requests and resubmissions retain the original deadline. A timely supplement preserves operation pending review. A subsequent unsuitable decision after the fixed deadline restricts sales until approval.
- REJECTED requires a reason category. After grace or the correction deadline it restricts sales immediately. An open rejected renewal may be resubmitted; creating another request never resets its clock.
- APPROVED requires the existing recorded manual identity/duplicate-account checks plus samePersonConfirmed=true. The original document version must still match. Exact document claims belonging to another account are rejected. Old claims remain retained.
- Approval advances the Shop document version and clears only identity restrictions. It never changes independently inactive Shop status or hidden/suspended Product status.

## API

| Method | Path                                                    | Payload / result                                                                                       |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| POST   | `/shops/:shopId/identity-renewals`                      | requestId; creates/reuses the current Owner's open cycle.                                              |
| POST   | `/shop-applications/:id/renewal-submissions`            | requestId, expectedVersion, identity, documentIds. Bank/pickup resubmission is unnecessary.            |
| GET    | `/shop-applications/mine` or `/shop-applications/admin` | Optional kind=INITIAL/RENEWAL and state filters.                                                       |
| POST   | `/shop-applications/admin/:id/decisions`                | Existing versioned decision, reasonCategory for nonapproval; samePersonConfirmed for renewal approval. |
| POST   | `/checkouts/:id/identity-review/confirm`                | confirmed=true and fingerprint from refreshed shipping quote. Returns current confirmed quote.         |

Private upload/completion/download and application detail APIs are shared with initial onboarding. Files are bound to their renewal cycle and current Owner; Staff cannot read them. Application summaries expose kind, correctionDueAt, reasonCategory and timelySubmission. Admin-only evidence remains private. No identity number, birth date or bank data enters public Shop projections or notification text.

## Sale and checkout behavior

Public Shop/Product responses expose identitySalesPaused. Restricted published listings remain visible. Product creation, submission/publication and new purchases are gated separately. Existing orders, disputes and funds are unchanged.

Reading an active checkout or requesting a shipping quote removes only orders belonging to restricted Shops, releases their held stock and resets existing wallet/coin reservations. The original checkout expiry is preserved. Removed items retain IDENTITY_RESTRICTED as their reason; approval does not put them back. All removed yields EMPTY.

For remaining Shops, shipping is quoted again and identityReviewRequired=true blocks MoMo, wallet and COD through shared pricing. The buyer must explicitly confirm the new quote fingerprint. The fingerprint binds remaining items, subtotal, shipping and coin selection; a price/selection change requires another confirmation. Confirmation is naturally repeatable for the same current quote and cannot acknowledge a later changed checkout.

An unresolved MoMo attempt retains its original amount, order allocation and stock. It is never rewritten into a partial payment. Current eligibility and review flags are rechecked at capture; an invalid captured payment follows the existing original-source refund path. A failed/refunded attempt can subsequently be pruned and reconfirmed.

## Worker and persistence

The bounded restart-safe worker observes due approved Shops every 30 seconds, uses the shared commerce lock and persists expiry/transition notification keys. Inbox/email intents commit with state; actual email delivery stays in the existing worker. Eligibility is calculated at request time, so scheduler delay cannot extend grace. Only Shops with an actual approved initial identity can bootstrap document expiry; legacy seed Shops are not retroactively identity-verified.

New columns and partial application indexes follow this repository's existing TypeORM schema synchronization setup. Apply schema changes through the normal deployment procedure; never reset a developer database. Tests use serial rewear_test and fake storage/carrier adapters.
