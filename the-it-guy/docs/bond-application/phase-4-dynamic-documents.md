# Phase 4 Dynamic Documents

## Purpose

Phase 4 replaces the Phase 3 temporary Documents handoff with a guided document checklist for eligible sole-applicant guided bond applications. The buyer completes guided Steps 1 through 7 and then continues into the existing Review and Sign section for declarations, typed signature and final submission.

Phase 4 does not introduce immutable submissions, new signing, participant-specific document ownership, database migrations, OCR, document classification, OOBA exports or bank-specific payloads.

## Existing Infrastructure Reused

- Required-document persistence remains in `transaction_required_documents`.
- Uploaded document persistence remains in `documents`.
- Uploads use the existing Client Portal upload path via `uploadClientPortalDocument()` and the existing `handleUploadRequiredDocument()` wrapper.
- Requirement reconciliation uses the existing client-portal token authorization and the existing `transaction_id,document_key` upsert identity.
- Originator and legacy document consumers continue reading the same transaction document rows.
- Existing storage, signed URL and RLS behaviour is preserved.

## Rule Contract

Document rules live under `src/modules/bond/application/documents/`.

Each rule contains:

- Stable requirement key.
- Rule set version: `phase-4-v1`.
- Scope and `participantRole: "primary_applicant"`.
- Canonical document type.
- Buyer-facing title, description and reason.
- `visibleWhen` and `requiredWhen` rules evaluated by the Phase 3 rule evaluator.
- Timing: `required_before_signature`, `required_before_bank_submission`, or `requested_after_originator_review`.
- Satisfaction mode: `uploaded` or `accepted`.
- Minimum file count.
- Matching aliases.
- Deterministic ordering.

Rules never contain applicant values, API calls or JSX.

## Rule Coverage

| Requirement key | Canonical document type | Participant role | Visible condition | Required before | Satisfaction | Min files | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `bond_application_primary_applicant_identity` | `buyer_id_document` | primary applicant | Always | signature | uploaded | 1 | Matches ID/passport aliases. |
| `bond_application_primary_applicant_address` | `buyer_proof_of_address` | primary applicant | Always | signature | uploaded | 1 | Matches proof-of-address aliases. |
| `bond_application_primary_applicant_bank_statements` | `bank_statements` | primary applicant | Always | bank submission | uploaded | 1 | Non-signature blocking. |
| `bond_application_deposit_proof` | `proof_of_funds` | primary applicant | Deposit greater than zero | bank submission | uploaded | 1 | Reuses reservation/deposit proof aliases. |
| `bond_application_salary_income_evidence` | `payslips` | primary applicant | Permanent, contract or commission income | signature | uploaded | 1 | Covers employed income evidence. |
| `bond_application_employment_contract` | `employment_contract` | primary applicant | Contract employee | signature | uploaded | 1 | Contract path only. |
| `bond_application_business_registration` | `buyer_company_registration` | primary applicant | Self-employed | bank submission | uploaded | 1 | Business registration where applicable. |
| `bond_application_self_employed_financials` | `financial_statements` | primary applicant | Self-employed | bank submission | uploaded | 1 | Business financial support. |
| `bond_application_commission_income_evidence` | `commission_income_evidence` | primary applicant | Commission-based | bank submission | uploaded | 1 | Commission history support. |
| `bond_application_retirement_income_evidence` | `pension_income_evidence` | primary applicant | Retired | signature | uploaded | 1 | Pension/annuity evidence. |
| `bond_application_other_income_evidence` | `proof_of_income` | primary applicant | Other or additional income | bank submission | uploaded | 1 | Recurring income support. |
| `bond_application_existing_property_bond_statement` | `property_finance_existing_bond` | primary applicant | Existing property = Yes | bank submission | uploaded | 1 | Does not create property records. |
| `bond_application_debt_settlement_evidence` | `debt_settlement_letter` | primary applicant | Existing debts = Yes | bank submission | uploaded | 1 | Does not create settlement workflows. |
| `bond_application_credit_history_support` | `credit_history_supporting_documents` | primary applicant | Credit-history Yes branch | bank submission | uploaded | 1 | Supports disclosed credit matters. |

## Resolution

`resolveBondApplicationDocumentRequirements()` evaluates the active rule contract against the clean bond application state. It returns active, inactive, required and optional requirements plus diagnostics. Missing paths resolve safely through the Phase 3 rule evaluator; `false`, `0`, empty strings, `null` and arrays are handled by the existing rule semantics.

Requirement ordering is deterministic by explicit `order` and stable key. `buildBondApplicationDocumentRequirementFingerprint()` creates a non-sensitive fingerprint from requirement keys, version, timing, role and file-count metadata. It does not include answers, filenames, document IDs, storage paths or tokens.

## Reconciliation

`buildBondApplicationDocumentReconciliationPlan()` is the pure reconciliation model. The runtime reconciliation API is `reconcileClientPortalBondDocumentRequirements()`.

The reconciliation behaviour is:

- Upsert active Phase 4 requirements into `transaction_required_documents`.
- Use `transaction_id,document_key` for idempotency.
- Preserve uploaded document links, review status, timestamps and notes.
- Only manage keys beginning with `bond_application_`.
- Preserve manually requested/originator requirements.
- Mark stale managed requirements inactive or not required where existing columns support it.
- Never delete uploaded files or accepted documents.
- Never write to bank workflow tables.

If older environments do not expose newer document columns, the helper falls back to the legacy row shape already supported by the existing document infrastructure.

## Matching And Reuse

The checklist matches documents by:

1. Existing explicit requirement-to-document link.
2. Exact canonical document type.
3. Canonical aliases declared on the requirement.
4. Buyer/client/primary-applicant role safety.

It does not use filenames, OCR, AI classification, content inspection or fuzzy matching. Seller, attorney, internal or ambiguous participant documents are not used to satisfy primary-applicant requirements.

Ambiguous matches remain unsatisfied and available for existing manual review paths.

## Status Normalization

The checklist maps underlying statuses into buyer-facing states:

- `satisfied` -> Already received.
- `missing` -> Still required.
- `uploaded_pending_review` -> Under review.
- `rejected` -> Needs attention.
- `partially_satisfied` -> Partially received.
- `not_currently_required` -> hidden from active progress.

Raw backend status codes are not shown to the buyer.

## Guided UI

The guided flow now includes:

- Step 7: `document_checklist`.
- Requirement groups: Already received, Still required, Under review, Needs attention, Can be provided later.
- Requirement cards with title, description, reason, timing, status, received count and upload/replace/retry actions.
- Document progress based on active required requirements.
- Summary rail document status.
- Mobile-friendly single-column cards and safe-area-aware footer.

Uploads call the existing `handleUploadRequiredDocument()` wrapper. The card does not write directly to Supabase and does not create its own upload API.

## Progress

Document progress is:

`completed active required requirements / total active required requirements`

Completion honours minimum file counts and satisfaction modes. Inactive and optional requirements do not reduce progress. Rejected documents do not satisfy a requirement. Required-before-signature requirements block Review and Sign handoff.

The main guided progress still reflects the eight-stage application journey. Completing Step 7 does not mean the full application is complete because Review and Sign remains outstanding.

## Review And Sign Handoff

The Documents Continue action:

1. Saves the latest application state through the existing guided save path.
2. Resolves requirements.
3. Reconciles `transaction_required_documents`.
4. Refreshes document data.
5. Blocks if required-before-signature requirements are missing.
6. Saves Phase 4 metadata.
7. Switches to the existing `declarations_consents` section.

The internal handoff reason is `phase_4_review_sign`. The buyer-facing interface does not use legacy or phase terminology.

No typed-signature, declaration, `submitted_at`, final submission, immutable snapshot, `/sign/:token`, bank application or finance-stage behaviour changed.

## Resume And Editing

Phase 4 metadata preserves:

- `flow_version: "phase-4-v1"`.
- `document_rule_set_version`.
- `document_requirement_fingerprint`.
- `review_sign_handoff_at`.
- `review_sign_handoff_reason`.

Returning before handoff restores the guided document screen and reloads requirement/document status from backend data. Returning after handoff remains in the existing Review and Sign experience because `legacy_handoff_at` remains set.

If earlier answers change, requirements are re-resolved and reconciled. Newly applicable requirements appear; inactive requirements stop blocking progress. Uploaded files are not deleted.

## Compatibility

- Feature flag false still renders the existing legacy application and Documents section.
- Joint, co-applicant and surety applications remain legacy fallback.
- Guided uploads use the same transaction document tables as legacy uploads.
- Legacy Documents can still show guided rows.
- Originator document review continues to read current document rows and statuses.
- Unit Detail and bond view-model consumers remain compatible.
- Offers, Grant, bank workflow, originator assignment and finance stages are unchanged.

## Security And Privacy

Phase 4 does not log application state, document payloads, filenames, storage paths, signed URLs, account data, identity documents or portal tokens. It does not store documents in localStorage/sessionStorage, does not create public links, does not add a third-party document service and does not introduce OCR or document classification.

## Known Limitations

- Documents remain transaction-level until participant document ownership is introduced.
- Co-applicant and surety documents are not independently owned.
- No participant-specific RLS exists.
- Ambiguous document matches require existing manual review.
- Multiple file counts are supported in the model, but actual enforcement depends on the existing document infrastructure.
- Final review remains in the existing application.
- Typed signatures remain.
- No immutable submission snapshot exists.
- No formal OOBA export adapter exists.
- Historic Phase 3 handoff applications are not automatically pulled back into guided Documents.

## Deferred To Phase 5

- Guided Review and Sign.
- Versioned declarations.
- Immutable submission snapshots.
- Generated final application document.
- `/sign/:token` integration.
- Signature requirements.
- Read-only submitted state.
- Submission versioning and superseded submission versions.
- Controlled correction and reopening groundwork.

## Explicit Non-Changes

No database migration, table, column, trigger, RLS policy, storage bucket, signing change, participant table, bank workflow change, originator workflow change, document classification, OCR, public URL or new upload system was introduced.
