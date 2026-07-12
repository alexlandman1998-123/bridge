# Document Flow QA Contract Lock Phase 0

Implemented on 2026-07-11.

## Goal

Lock the intended QA contract for the current document flow before updating tests. The current document storage, access, staging smoke, and build checks are launch-safe; the remaining failures are test-contract drift unless product intentionally wants the older UI or progress semantics restored.

## Locked Contracts

### Transaction Documents Command Centre

The transaction Documents workspace source of truth is the current `documentReadiness` model, not the retired `documentHealthSummary` model.

The expected current UI contract is:

- `Document Readiness` summary and readiness score
- `Critical Documents`
- `Documents Requested By Banks`
- `Missing Documents`
- `Recent Uploads`
- `Document Library`
- modal-driven document upload
- canonical requirement linking through `canonicalRequirementInstanceId`

The failing `transaction-documents-command-centre` test should be updated to assert the current readiness contract. It should not require the old `documentHealthSummary` symbol unless product decides to restore that compatibility alias.

### Finance Progress

The current bond/hybrid finance workflow returns `9%` for the `documents` stage. This reflects the expanded workflow ladder now in use.

The next test update should avoid brittle single-stage percentage assumptions where possible and assert progression invariants:

- `intake < documents < submitted_to_banks < instruction_sent < complete`
- `complete === 100`
- a completed workflow still returns `100`

If product wants the older `14%` stage value, the implementation should be changed in the workflow model first. Otherwise, the test should be updated to accept `9%`.

### Buyer Onboarding Flow Version

`buyer_onboarding_flow_v2` is the current canonical buyer onboarding flow contract.

Persisted `buyer_onboarding_flow_v1` snapshots are backwards-compatible input only. Tests should expect v2 for newly derived facts while still proving v1 snapshots can be safely read and normalized.

## Affected Tests

- `scripts/transaction-documents-command-centre.test.mjs`
- `scripts/finance-tab-launch-readiness.test.mjs`
- `scripts/transaction-canonical-document-engine.test.mjs`

## Launch Posture

These three issues are not launch-critical blockers for the document storage/access flow. They should be closed before calling QA fully clean, but the staging smoke, upload/download storage round-trip, access grants, canonical lifecycle, seller propagation, and production build already passed.

## Phase 0 Acceptance

- Intended current behavior is documented before changing assertions.
- The older contracts are explicitly classified as test drift unless product requests restoration.
- The next phases can update tests against this note without changing storage or access behavior.

## Phase 4 QA-Clean Gate

Implemented on 2026-07-11.

Phase 4 closed the local QA-clean gate for the document flow after the three stale contract tests were updated. The canonical engine regression is now exposed through `npm run test:transaction-canonical-document-engine` so all three formerly failing checks can be repeated from package scripts.

### Passing Checks

- `npm run test:transaction-documents-command-centre`
- `npm run test:finance-tab-launch-readiness`
- `npm run test:transaction-canonical-document-engine`
- `npm run test:canonical-document-resolver`
- `npm run test:canonical-document-adapters`
- `npm run test:canonical-document-lifecycle`
- `npm run test:canonical-document-upload-path`
- `npm run test:canonical-document-workspace`
- `npm run test:canonical-document-review-ui`
- `npm run test:document-request-scenario-matrix`
- `npm run test:document-request-stale-finance-rows`
- `npm run test:seller-document-propagation`
- `npm run test:seller-listing-document-continuity`
- `npm run test:canonical-workflow-gates`
- `npm run test:canonical-document-reminders`
- `npm run test:canonical-document-consolidation`
- `npm run test:canonical-document-packet-fixture`
- `npm run test:canonical-document-primary-pilot`
- `npm run test:canonical-document-staging-backfill`
- `npm run test:canonical-document-staging-link-cleanup`
- `npm run test:document-generator-launch-gate`
- `npm run verify:document-generator-launch`
- `npm run test:canonical-document-rls-grants`
- `npm run build`

### Notes

- `test:canonical-document-rls-grants` requires Supabase network access. The first sandboxed run failed on DNS, then passed when rerun with network access.
- `verify:document-generator-launch` passed with `launchReady: true`, `blockingIssueCount: 0`, and `warningCount: 0` after the generated packet fixture document-link cleanup.
- `npm run build` passed. Existing Vite warnings remain: circular manual chunks and one telemetry module being both dynamically and statically imported.

## Phase 4 Launch Posture

No launch-critical blocker remains from the three open QA-clean issues listed above. The document flow is locally QA-clean across command centre, finance readiness, buyer onboarding flow normalization, canonical lifecycle, upload-path shape, request propagation, workflow gates, packet fixtures, RLS grants, and production build.

## Phase 5 Fixture Link Cleanup

Implemented on 2026-07-11.

The remaining document-generator warning was confirmed as staging fixture hygiene rather than a runtime generator defect. Live OTP/mandate generation already fails if a generated preview has no `renderedDocumentId`; the pilot fixture had packet-version file paths but no corresponding `documents` rows.

Cleanup applied:

- added `npm run cleanup:document-generator-fixture-links`
- dry-run confirmed 8 fixture packet versions with generated preview paths and no linked document records
- write mode created 8 generated-document rows for the fixture and linked all 8 `document_packet_versions.rendered_document_id` values
- reran `verify:document-generator-launch` with a fresh snapshot; result: `launchReady: true`, `blockingIssueCount: 0`, `warningCount: 0`

The packet fixture and primary pilot regressions now assert `rendered_document_id` so the fixture cannot drift back silently.
