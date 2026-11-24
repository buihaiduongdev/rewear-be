# Product and Shop violation reports

Implements `REPORT-SESSION-01` in the submission decisions. An active user can report a Product or Shop, select a categorized reason, describe the issue and attach private image evidence. Admin reviews and explicitly chooses the outcome and any target action.

## Reporter APIs

All endpoints require authentication and a currently active account.

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/reports` | Create with `requestId`, `targetType`, `targetId`, `reason`, `description`, `evidenceIds`. |
| GET | `/reports/mine` | Private paginated summaries, optional status/target type filters. |
| GET | `/reports/:id` | Own report, public resolution and public audit history. |
| POST | `/reports/:id/supplements` | Add text/images while OPEN or IN_REVIEW; request replay protected. |
| POST | `/media/upload-ticket` | Obtain a private upload URL and media ID. |
| POST | `/reports/evidence` | Link uploaded media to a target, with optional own open `reportId`. |
| GET | `/reports/evidence/:id/download` | Short-lived private image URL for reporter or current active Admin. |

Reasons: COUNTERFEIT, PROHIBITED_ITEM, MISLEADING_CONTENT, OFFENSIVE_CONTENT, FRAUD, OTHER. At most six JPEG/PNG/WebP images per report, at most 10 MiB each. Upload tickets expire after 15 minutes; each user may register at most 200 report evidence records in a rolling day.

Targets must be publicly available or supported by the reporter's own historical Order snapshot. Historical Product context uses the original OrderItem title, not later private edits. A registered evidence record retains its server-captured target snapshot, so hiding a target after upload does not prevent submission. Arbitrary client snapshots and arbitrary media URLs are not accepted. Attached evidence cannot be reused for a different report; unattached evidence is not downloadable.

## Admin workflow

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/reports/admin` | Current active Admin queue, bounded pagination. |
| GET | `/reports/admin/:id` | Full detail, current target state/version and private Admin audit fields. |
| POST | `/reports/admin/:id/claim` | Record reviewer assignment with requestId and expectedVersion. |
| POST | `/reports/admin/:id/resolve` | Version-checked outcome, action, public reason and private adminNote. |

Lifecycle: OPEN → IN_REVIEW → RESOLVED; resolution from OPEN is also allowed. Claiming is informational assignment: another active Admin can handle the case with its current version. Resolved reports cannot receive new supplements or decisions. Exact command replay remains safe after resolution; changing a reused request payload conflicts.

Outcomes are CONFIRMED or DISMISSED. DISMISSED requires NONE. A confirmed report may use NONE, SUSPEND_PRODUCT or DEACTIVATE_SHOP, constrained to the corresponding target type. Product suspension requires `expectedTargetVersion` from current moderation state and applies to ACTIVE/HIDDEN products, or is an explicit no-op when already SUSPENDED. HELD/SOLD products cannot be suspended by this path: the Admin can resolve with NONE without changing their stock state. Shop deactivation uses existing INACTIVE guards for new business.

Report/command/audit, target action and inbox events commit atomically. Stale report/target versions or invalid actions leave no partial resolution. Actions do not cancel existing orders, release reserved stock, refund money or change settlement balances.

## Privacy and operational scope

Only the reporter and a current active Admin can read a report's attached evidence. Being the target Shop owner or Staff does not grant access to the report, reporter identity or evidence. Reporter responses omit Admin identities and private notes. Admin `reason` is public resolution text; `adminNote` is private and must not be used for reporter-facing content. Product moderation may notify its owner through the existing moderation channel; Shop deactivation sends a generic owner notice. Report activity publishes safe inbox events without per-report email.

Lists return summaries; details load evidence/history. Private storage must be configured separately from public product media and enforce immutable uploads. Tests use a storage fake, not a live bucket. No automatic mass-report takedown, report SLA, appeal/reopen policy or composite reputation penalty is introduced: those rules were not settled in REPORT-SESSION-01. Frontend forms/queues remain separate work.

## Verification

PostgreSQL integration tests cover submission replay, historical target privacy, versioned Admin actions, atomic failure, held-stock safety, supplements, owned image access, immutable completion and hidden-target upload context. Schema and HTTP tests cover strict inputs, authorization, serialization and OpenAPI routes. DB tests use dedicated `rewear_test` serially. See the PR for final CI results.
