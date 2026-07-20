# Supabase Release Branch Scope

Generated: 2026-07-20
Branch: `codex/mvp-pilot-readiness`

## Release scope

This release commit is limited to the reviewed Supabase reconciliation work completed through staging Phases 0–8:

- migration inventory, manifest, split-ledger, staging, production, and closeout gates;
- staging reports and per-version verification evidence;
- least-privilege corrections to the reviewed manifest migrations;
- Phase 7 and Phase 8 CI gates;
- focused migration contract tests;
- removal of tracked local environment files while preserving them on disk.

The manifest contains 64 versions, all 64 are recorded on staging, and production remains unchanged.

## Explicitly excluded concurrent work

The following work is intentionally excluded from this database release commit:

- document-editor and conditional-master application changes under `the-it-guy/src/`;
- associated new document scenario and conditional-engine tests;
- removal of the MVP pilot creation-freeze application module;
- application package-script changes associated with that module removal;
- `202607200001_conditional_legal_masters_phase4.sql`;
- `202607200002_seller_onboarding_connected_attorney_resolution.sql`;
- other application-page, listing, lead, and transaction-service edits not required by the 64-row migration manifest.

Those files remain in the working tree and are not discarded or staged by this release preparation.

## Verification

- Supabase Phase 0, 6, 7, and 8 gate tests: 4 passed.
- Settings, attorney accounting, calendar, attorney identity/access, transaction creation, and seller onboarding contract tests: 28 passed.
- Canonical document persistence/template contract tests: 4 passed.
- Total focused release tests: 36 passed, 0 failed.
- `git diff --check`: passed.
- Secret scan: no known exposed database password or credential-bearing PostgreSQL URL found in the release files.

The complete Vite application build was started but did not finish the transformation stage within the bounded release check and was terminated. Because the working tree contains substantial concurrent application changes outside this release scope, the application build must be rerun on the isolated application commit before frontend deployment.

## Remaining production blockers

- 43 historical attorney assignments still block staging attorney-role certification.
- Phase 7 readiness is not human-approved.
- Tested production recovery is not attested.
- Production migration promotion and 64 production evidence rows remain outstanding.
- The Phase 0 broad-push freeze remains active.
