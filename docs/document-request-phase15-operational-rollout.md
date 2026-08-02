# Document Request Phase 15: Operational Rollout

Date: 2026-08-02

## Scope

Phase 15 expanded canonical document-request syncing from the three-transaction pilot to a limited operational batch selected from active portal-access transactions.

The rollout still writes only `transaction_required_documents`. It does not create `document_requests`, send emails, or expose raw portal tokens.

## Implemented

- Added `the-it-guy/scripts/document-request-canonical-phase15-operational-rollout.mjs`.
- Added `the-it-guy/scripts/document-request-canonical-phase15-operational-rollout-contract.test.mjs`.
- Candidate selection defaults to active portal access:
  - active buyer portal links
  - active/pending seller portal contexts
  - active external access rows
- The runner defaults to dry-run.
- Writes require both:
  - `--commit`
  - `--confirm-operational-rollout`
- The runner caps the operational batch at 25 transactions unless explicitly overridden.
- The runner calls the Phase 14 portal verifier after rollout and includes that gate in the final report.

## Dry-Run Gate

Dry-run report: `the-it-guy/output/document-request-phase15-operational-rollout-dry-run.json`

- Candidates: 10 active buyer-portal transactions
- Failed: 0
- Rows calculated: 68
- `document_requests` delta: 0
- Preserved uploaded/review rows changed: 0
- Phase 14 portal verification failed: 0
- Missing committed keys from shared portal model: 0
- Gate passed: true

## Commit Result

Commit report: `the-it-guy/output/document-request-phase15-operational-rollout.json`

- Candidates committed: 10
- Completed: 10
- Failed: 0
- Rows calculated: 68
- Rows synced: 68
- Required-document row delta: 64
- `document_requests` delta: 0
- Client-facing document requests created: false
- Preserved uploaded/review rows changed: 0
- Phase 14 portal verification failed: 0
- Missing committed keys from shared portal model: 0
- Gate passed: true

Post-check report: `the-it-guy/output/document-request-phase15-operational-rollout-postcheck.json`

- Completed: 10
- Failed: 0
- Additional row delta after commit: 0
- `document_requests` delta after commit: 0
- Phase 14 portal verification failed after commit: 0
- Gate passed after commit: true

## Rollout Transactions

- `711ec65a-c24c-4184-90e0-d1bddb01dcea`
- `4e639151-3bdb-4919-af34-d6bcbb55fec4`
- `9f46b2ba-1324-4419-b975-cb00818718f0`
- `51b80dff-4d0d-4fe7-80fc-5abebfc9e74f`
- `4a558d8c-4d0e-4d96-a3b1-e9f7e7313fb8`
- `3e611ebb-be0f-46b1-9495-9bf150cd967a`
- `63af1887-4277-4a8c-8dab-5fc4bf80089c`
- `f3de5516-a6c9-4f5d-88ca-d51114c5a84d`
- `88f73094-c2bd-4dd5-b51b-ac0425fe4689`
- `2c5ea588-71f5-4983-a6a5-b4591eecc16b`

## Remaining Operational Item

The Phase 15 portal verifier still reports 56 non-canonical existing keys across the 10 operational transactions. These are legacy required-document rows that remain visible alongside the canonical rows.

This did not block the gate because:

- no committed canonical key is missing from the shared portal model
- no duplicate item keys were reported by the verifier
- no upload/review state was changed

Before a wider seller/buyer rollout, add a legacy-key migration or hiding rule so old required-document keys are mapped, disabled, or clearly separated from canonical requirements.

## Verification Commands

- `node --check scripts/document-request-canonical-phase15-operational-rollout.mjs`
- `node scripts/document-request-canonical-phase15-operational-rollout-contract.test.mjs`
- `node scripts/document-request-canonical-phase15-operational-rollout.mjs --limit=10 --output=output/document-request-phase15-operational-rollout-dry-run.json --portal-output=output/document-request-phase15-portal-verification-dry-run.json`
- `node scripts/document-request-canonical-phase15-operational-rollout.mjs --limit=10 --commit --confirm-operational-rollout --output=output/document-request-phase15-operational-rollout.json --portal-output=output/document-request-phase15-portal-verification.json`
- `node scripts/document-request-canonical-phase15-operational-rollout.mjs --limit=10 --output=output/document-request-phase15-operational-rollout-postcheck.json --portal-output=output/document-request-phase15-portal-verification-postcheck.json`
