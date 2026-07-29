# Phase 5: Guided Review, Signing and Submission

## Purpose

Phase 5 replaces the temporary Phase 4 Review and Sign handoff with a guided review, declaration, immutable submission and signing process for eligible sole applicants.

Phase 5 does not introduce co-applicant access, surety access, normalized participant tables, originator request-changes, OOBA export or bank-specific payload mapping.

## Supported Applicant

The guided Phase 5 flow supports the Phase 3 and Phase 4 sole-applicant journey only:

- `primary_applicant`
- Permanent employee
- Contract employee
- Self-employed
- Commission-based
- Retired
- Other supported income

Joint, co-applicant and surety applications remain on the legacy application and legacy typed-signature process.

## Guided Screens

Step 8 now has stable guided screen keys:

| Screen key | Purpose |
| --- | --- |
| `review_overview` | Review cards for application sections and edit navigation. |
| `declarations` | Versioned declaration acceptance. |
| `prepare_signature` | Readiness validation and submission preparation. |
| `awaiting_signature` | Locked pre-signing state with `/sign/:token` action. |
| `submitted_status` | Read-only submitted application state. |

Step 7 Documents now continues to `review_overview` instead of the Phase 4 legacy Review and Sign handoff.

## Readiness Validation

`validateBondApplicationSubmissionReadiness()` checks:

- Applicable required questions in Steps 1 to 6.
- Required repeatable records.
- Required-before-signature document requirements.
- Selected banks where current rules require at least one.
- Primary applicant signer name and email.
- Required declaration acceptance.
- Save state.
- Existing active/submitted submission status.

Readiness issues are structured by category, path, step and screen where available.

## Review Editing

Review cards use stable screen keys and call the existing guided controller. Edits preserve current answers, then the flow and document rules recalculate through the Phase 3 and Phase 4 engines. No snapshot is created until the buyer prepares for signing.

## Declaration Contract

Declarations live in `bondApplicationDeclarations.js`.

Contract version: `phase-5-v1`.

The wording is copied from the existing legacy bond application declarations:

| Key | Required | Source |
| --- | --- | --- |
| `loan_processing_consent` | Yes | Legacy declarations and consents section. |
| `credit_bureau_fraud_bank_data_consent` | Yes | Legacy declarations and consents section. |
| `insurance_third_party_communication_consent` | Yes | Legacy declarations and consents section. |
| `nhfc_first_home_finance_consent` | No | Legacy declarations and consents section. |
| `application_information_accuracy` | Yes | Legacy declaration accepted field. |
| `marketing_privacy_preference` | No | Legacy marketing/privacy preference. |

Mandatory declarations are not preselected. Optional marketing consent is separate and non-blocking.

## Declaration Evidence

The submission snapshot stores:

- Declaration key.
- Version.
- Contract version.
- Title.
- Exact text.
- Required/optional status.
- Blocking status.
- Participant role.
- Accepted value.
- Accepted timestamp where accepted.
- Selected bank IDs where relevant.
- Legacy path reference.

It does not store a single `consent_accepted: true` shortcut.

## Submission Table

Migration:

`supabase/migrations/202607280003_guided_bond_application_phase5_submissions.sql`

Table:

`transaction_bond_application_submissions`

Primary fields:

| Field | Purpose |
| --- | --- |
| `transaction_id` | Transaction relationship. |
| `onboarding_form_data_id` | Source draft relationship. |
| `submission_version` | Immutable version number per transaction. |
| `application_schema_version` | Clean state schema version. |
| `flow_version` | Guided flow version. |
| `document_rule_set_version` | Phase 4 document rule version. |
| `declaration_contract_version` | Phase 5 declaration version. |
| `status` | Submission lifecycle state. |
| `snapshot_json` | Immutable signed application state. |
| `snapshot_hash` | Deterministic SHA-256 snapshot hash. |
| `source_application_hash` | Hash of saved source legacy JSON. |
| `declarations_json` | Declaration acceptance evidence. |
| `document_manifest_json` | Frozen document manifest. |
| `selected_bank_ids` | Bank selection snapshot. |
| `signer_manifest_json` | Expected signer snapshot. |
| `generated_document_id` | Generated packet version reference. |
| `signing_request_id` | Existing `document_packets` request reference. |
| `signed_document_id` | Signed document reference when available. |

Indexes enforce transaction/version lookup and one active pending guided submission per transaction.

## Lifecycle

```text
draft
  -> preparing
  -> awaiting_signature
  -> submitted

terminal alternatives:
  failed
  cancelled
  superseded
```

`submitted` is only set after the existing signer record reports the required signer as `signed`.

## Immutability

The migration adds `bridge_prevent_bond_submission_snapshot_mutation()`.

The trigger rejects updates to:

- `snapshot_json`
- `snapshot_hash`
- `declarations_json`
- `document_manifest_json`
- `selected_bank_ids`
- `signer_manifest_json`
- version metadata
- source hash/version fields

Lifecycle fields such as status, signing request, signed document, failure and timestamp fields may update.

## Snapshot Schema

The snapshot includes:

- Transaction reference.
- Property and finance.
- Primary applicant details.
- Employment and income.
- Monthly commitments.
- Bank accounts.
- Debts.
- Existing properties.
- Assets and liabilities.
- Credit declarations.
- Selected banks.
- Document manifest.
- Declaration evidence.
- Signer manifest.
- Source references.
- Version metadata.

The snapshot excludes:

- Portal tokens.
- Signing tokens.
- Signed URLs.
- Storage paths.
- UI state.
- Temporary upload state.
- Analytics identifiers.
- Hidden inactive branch values as active answers.
- Other participant data.

## Hashing

`bondApplicationSnapshotHash.js` uses canonical JSON serialization with sorted object keys and SHA-256 through Web Crypto. Tests prove:

- Identical snapshots produce identical hashes.
- Object key order does not change the hash.
- Changed answers change the hash.

## Server Boundary

`prepareClientPortalBondApplicationSubmission()` reloads the saved portal application, resolves document requirements, validates readiness, builds the snapshot and inserts the immutable submission record. The implementation uses the existing token-scoped Supabase client and database immutability guard. A future service-only RPC can strengthen this boundary without changing the UI controller.

## Document Manifest

The manifest freezes active checklist items at preparation time:

- Requirement key.
- Canonical document type.
- Participant role.
- Required timing.
- Satisfaction mode.
- Requirement status.
- Matched document ID.
- Document status.
- Upload and acceptance timestamps where available.
- Rule set version.

It does not include public URLs, signed URLs, storage paths, file contents or internal notes.

## Signing Integration

Phase 5 reuses:

- `document_packets`
- `document_packet_versions`
- `document_packet_signers`
- `document_signing_fields`
- `/sign/:token`
- existing signer-token resolution and signer completion authority
- existing final signed artifact infrastructure

The generated application document is stored as a document packet version preview artifact and linked to one `purchaser_1` signer representing `primary_applicant`.

The signing token is never stored in `bond_application` JSON.

## Finalization

`fetchClientPortalBondApplicationSubmission()` refreshes the active signer state. If the existing signing infrastructure reports `purchaser_1` as `signed`, `finalizeClientPortalBondApplicationSubmission()`:

- Marks the submission `submitted`.
- Sets `signed_at` and `submitted_at`.
- Updates legacy `bond_application.status` and metadata for compatibility.
- Leaves the immutable snapshot unchanged.

Browser redirects alone do not finalize the application.

## Locking

`isBondApplicationSubmissionLocked()` identifies `awaiting_signature`, `signed` and `submitted` states. The guided UI shows non-editable awaiting/submitted states. The database trigger protects immutable snapshot content. Full post-submission revisions are deferred to Phase 7.

## Compatibility

Legacy fallback remains available when:

- `guided_bond_application_v2` is disabled.
- The application is joint/co-applicant/surety.
- The application is historic or already legacy-submitted.

The legacy typed signature remains unchanged for legacy flows.

Unit Detail and originator views can continue reading legacy `bond_application` status and documents. Guided submissions also expose immutable snapshot records for future read-only consumers.

## Security and Privacy

Phase 5 does not introduce public document URLs, localStorage snapshots, signing-token storage in application JSON, snapshot analytics, bank workflow writes or participant document access. Existing storage and token-scoped document access remain in use.

## Known Limitations

- Only `primary_applicant` signs in guided Phase 5.
- Co-applicants remain on legacy.
- Sureties remain on legacy.
- No participant-specific application records exist.
- No participant-specific document ownership exists.
- No originator Request changes workflow exists.
- Submitted guided applications cannot yet be formally reopened.
- Historic legacy submissions do not receive fabricated snapshots.
- Legal wording still requires normal business approval and governance.

## Deferred To Phase 6

- `bond_applications`
- `bond_application_participants`
- Participant sections
- Participant invitations
- Separate participant access tokens
- Separate co-applicant and surety completion
- Participant-specific documents and declarations
- Multiple required signers

## Deferred To Phase 7

- Originator Request changes.
- Controlled reopening.
- Post-submission revisions.
- New signed versions after correction.
- Section-specific correction requests.
- Superseded submitted versions.
- Revision history UI.

## Explicit Non-Changes

Phase 5 introduced no bank submissions, no bank application rows, no finance-stage progression, no participant tables, no OOBA mapping and no bank-specific payload mapping.
