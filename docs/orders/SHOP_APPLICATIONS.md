# Owner KYC inside Shop onboarding

Implements initial Shop application review under ACCOUNT-01/02, SELLER-REG-01..09, SHOP-VERIFY-SESSION-01, SHOP-OWNER-KYC-01 and SHOP-BANK decisions. Owner identity is reviewed within the Shop application. Manager/Staff do not submit Owner documents just to join a Shop.

## Onboarding and activation

`POST /shops` now creates a PENDING Shop shell, Owner membership and default roles. The Owner can configure name/logo, pickup location and receiving bank account using existing APIs. Public Shop lookup/catalog and Product creation require ACTIVE; this includes blocking draft Product creation before review. Ordinary Shop PATCH accepts ACTIVE/INACTIVE only and cannot change availability while onboarding approval is missing, including switching through INACTIVE.

The application references the existing pickup and a bank profile currently confirmed by the Owner. A differently named bank recipient is permitted. Application approval does not mark the bank MANUALLY_VERIFIED; the existing recipient check before payout still applies. Pickup snapshots use the province/district/ward model integrated from PR62. Existing GHN connection setup remains separate from identity approval; no live GHN verification is claimed here.

Flow: create application DRAFT → upload/complete private documents → submit immutable revision → Admin chooses APPROVED, NEEDS_INFO or REJECTED. NEEDS_INFO/REJECTED allow corrected resubmission on the same application, preserving revision history. APPROVED atomically claims the identity document, records review and activates that Shop. There is no separate seller role/approval and no second approval step after the Shop decision.

Application is unique per Shop. Commands use actor-scoped requestId and payload checks; mutations require expectedVersion. A replay returns current detail without applying the old action again. In particular, replaying approval does not reactivate a subsequently inactive Shop. Current role/account/ownership is rechecked on replay.

## Identity requirements and manual verification

- CCCD/thẻ căn cước: twelve-digit document number and both FRONT/BACK images.
- Passport: issuing-country code, alphanumeric number and PASSPORT information-page image. No ordinary selfie requirement.
- Identity fields: full name, birth date and document expiration date. Applicant must be18 or older and document unexpired on both submission and approval, evaluated by Vietnam date. Expiration day is valid through that date. Leap-day eighteenth birthdays are reached on March1 in non-leap years.
- Admin records a public decision reason; approval additionally requires evidence of identity/duplicate-account review and explicit confirmation that documents match the applicant and another approved account has not been found. An Admin cannot review their own application.
- An exact type/country/document-number claim is unique and serializes concurrent approvals. Admin detail also lists possible registered identity matches by normalized name/birth date or exact claim. Matches are review leads, not automatic proof that two people are the same.

Cross-document person matching, authenticity and matching images to typed details require genuine manual Admin review. A different passport/CCCD cannot be automatically identified as the same person without a verified external identity source. This implementation does not claim OCR, biometric verification or national registry integration. Registry document fingerprints are server-side and not returned by public/applicant APIs.

## Snapshot and concurrent changes

Submission saves a server-built Shop/profile, pickup, bank, identity and selected-document snapshot in an immutable revision. Client-supplied snapshots or applicant ids are rejected. Approval recalculates current context and refuses a changed Shop, pickup or receiving bank. Admin can request corrected information and the Owner resubmits. Snapshot hashes canonicalize nested object keys so PostgreSQL JSONB ordering is irrelevant.

The commerce transaction lock serializes submissions/decisions with Shop profile and pickup changes; bank changes already use that lock. Current Admin and Owner User rows remain read-locked through the transaction, so concurrent account suspension or role revocation cannot commit between authorization and activation. Audit, identity claim, Shop activation and safe inbox/email intents commit together or roll back together.

## Document privacy

Images use the existing separate private bucket adapter, application-owned upload tickets and immutable object conditions. JPEG/PNG/WebP only, at most10 MiB per image, fifteen-minute ticket and bounded daily upload issuance. Completion verifies HEAD MIME, size and ETag. An attached object cannot be overwritten or imported from another application. Metadata checks are not authenticity verification.

Only the active current applicant/Owner and a current active Admin can access documents. Admin download requires that the document has appeared in a submitted revision; the applicant may preview their own ready draft. Staff/Manager, unrelated users and public Shop/Product media APIs get no access. Download links expire after the shared short private-download TTL; a previously issued signed URL cannot be instantly revoked by role changes.

Applicant detail contains their current snapshot, document ids and public history, without Admin notes, internal reviewer ids, duplicate-account matches, storage keys or request fingerprints. Admin detail includes private notes/check evidence and revision snapshots. Paginated summaries omit identity/bank/media payloads. Important Admin decisions queue generic email to the applicant only; Admin queue activity remains in-app. Notices/emails never embed identity number, document images or banking details.

## APIs

Paths are relative to the configured `/api` prefix. All require authentication and current active account/role/ownership checks.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/shops/:shopId/application` | Create/retrieve the Owner's single draft application with requestId. |
| GET | `/shop-applications/mine` | Current Owner's bounded application summaries. |
| GET | `/shop-applications/:id` | Applicant private detail. |
| POST | `/shop-applications/:id/uploads` | Owned private upload by FRONT/BACK/PASSPORT slot. |
| POST | `/shop-application-documents/:id/complete` | Verify immutable object metadata. |
| GET | `/shop-application-documents/:id/download` | Authorized short-lived read. |
| POST | `/shop-applications/:id/submissions` | Versioned identity/bank/document submission or resubmission. |
| GET | `/shop-applications/admin` | Admin paginated summaries, optional state. |
| GET | `/shop-applications/admin/:id` | Admin snapshot/history/match review. |
| POST | `/shop-applications/admin/:id/decisions` | Versioned decision with reason and approval checks. |

## Scope and verification

Existing legacy/seed ACTIVE Shops retain existing behavior; default migration fields do not retroactively claim those Owners were identity-verified. New API-created Shops require onboarding. A production backfill/review of legacy Shops must be planned separately. Do not reset a developer database to install this feature.

This delivers initial onboarding only. Postapproval document renewal/30-day grace and related restrictions, suspected/confirmed identity fraud, order/fund consequences and identity appeals remain subsequent backend work. No initial-review SLA was invented from dispute or appeal SLAs. Frontend forms/queues and real private-storage verification are separate work.

Tests use dedicated rewear_test serially and fake private storage: national ID/passport requirements, age/expiry, pending sale/status gate, stale snapshots, exact duplicate approval concurrency, role-revocation locking, document privacy/metadata, command replay, HTTP schemas and PII-safe notices. Final PR records full build/typecheck/regression CI evidence.
