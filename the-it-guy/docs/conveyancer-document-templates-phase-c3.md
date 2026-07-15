# Conveyancer Document Templates — Phase C3

## Purpose

C3 is the fail-closed data-validation gate for C2 correspondence drafts. It proves that the draft is unchanged, still belongs to the active matter and exact governed template, can be reproduced from the supplied source data, and satisfies the validation rules approved with that template version.

The executable service is `src/services/attorneyWorkflow/conveyancerCorrespondenceDataValidation.js`.

## Governed rule contract

Validation rules live on C1 template variables and form part of the template governance fingerprint. Adding, removing or relaxing a rule after approval invalidates the approval fingerprint.

Supported rules cover:

- Email, phone, South African ID, company-registration, trust-reference and postal-code formats.
- Minimum and maximum text length.
- Allowed values and numeric boundaries.
- Dates that cannot be past or future.
- Values that must match or differ from another variable.
- Dates that must precede or follow another variable.
- Required source verification and maximum source age.

Rules are `blocking` by default and may explicitly be `warning`. Arbitrary regular expressions and executable callbacks are not accepted.

## Validation flow

1. Validate the active A-series matter plan and optimistic plan identity.
2. Enforce actor visibility and legal-lane authority.
3. Confirm the input is an unchanged C2 draft with dispatch disabled.
4. Recompute the draft content fingerprint, including recipients.
5. Verify exact plan, transaction, organisation, lane, template version, content hash and governance fingerprint bindings.
6. Confirm the governed template remains published, effective and applicable at validation time.
7. Reproduce every merged value from the supplied matter, organisation, signing, manual, calculated and approved-clause sources.
8. Compare each reproduced value hash and provenance entry with the C2 variable manifest.
9. Apply governed field, cross-field, verification and freshness rules.
10. Block unresolved or unknown source conflicts.

## Outcomes

- `passed`: every check passed.
- `warning`: only warning-severity rules failed; the draft may proceed to review.
- `blocked`: at least one blocking check failed; the draft may not proceed to review.

Every result has `dispatchAllowed: false`. C3 certifies readiness for a later review stage; it does not approve wording or authorise sending.

## Privacy and auditability

The immutable report contains source paths and SHA-256 value hashes, not resolved field values. The audit event records check counts, failed codes, sensitive field keys and exact plan/template/content provenance without copying correspondence content, recipient details, identity numbers or competing source values.

Command IDs provide authorised idempotent replay. Inputs are never mutated.

## Phase boundary

C3 does not persist reports, alter source data, resolve conflicts, amend drafts, approve correspondence, dispatch messages, create evidence or advance matter actions. The current template and workflow records support this in-memory gate, so no database migration is required.
