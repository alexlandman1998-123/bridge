# Bond Phase 5 Readiness (Phase 4F)

Date: 2026-05-26

## Summary

Phase 4F completed script-level legacy workspace classification, explicit manual mapping for unresolved active legacy rows, and backfill dry-run stabilization.

Interactive browser/session smoke is blocked in this environment because no browser automation tool and no staging account login flow are available in-tool for this run.

## Canonical assignment coverage

- Total transactions: 67
- Canonical assignment present: 6
- Legacy email only: 8
- Participant only: 14
- Role-player only: 1

## Workspace resolution classification (reconciliation)

- resolvedFromCanonical: 6
- resolvedFromParticipantWorkspace: 6
- resolvedFromParticipantOrganisation: 0
- resolvedFromMembershipEmail: 0
- resolvedFromMembershipUser: 1
- resolvedFromManualMapping: 0
- singleBondWorkspaceLowConfidence: 0
- missingWorkspace: 0
- ambiguousWorkspace: 0
- archivedOrInactive: 25
- notBondScoped: 0
- acceptedUnresolvedLegacy: 29

## Backfill dry-run

- wouldUpdate: 6
- wouldSkip: 6
- manualReview: 1
- missingWorkspace: 0
- ambiguousWorkspace: 0
- acceptedUnresolvedLegacy: 54
- notBondScoped: 0
- unsafe: 0

## Legacy unresolved split

- Unsafe unresolved (must resolve before strict cutover scope): 0
- Accepted unresolved legacy (excluded from cutover scope): 54

## Alignment checks

- safeToBackfill (reconciliation): 6
- wouldUpdate (backfill): 6
- Status: aligned

## Interactive role smoke status

Not completed in this run due tooling/session constraints (no browser automation and no staging login/session control available in-tool).

Required before Phase 5:

- independent originator
- consultant
- processor
- compliance
- branch manager
- regional manager
- hq manager / owner / director
- workspace switching and negative-access checks

## Known risks

1. Interactive staging verification for role-based dashboard behavior is pending.
2. Canonical/legacy mismatch rows still need manual reconciliation policy confirmation.
3. Accepted unresolved legacy rows (54) must remain excluded from strict canonical RLS enforcement scope.

## Recommendation

No-go for full Phase 5 hard cutover right now until interactive role/session smoke is complete.

Go for a scoped Phase 5 only if policy scope explicitly excludes `acceptedUnresolvedLegacy` rows and preserves compatibility fallbacks for unresolved legacy records.

## Phase 5A shadow status

- Shadow migration added: `202605250019_bond_rls_shadow_helpers_phase5a.sql`
- Shadow comparison input: `/tmp/staging-bond-assignment-export.json`
- Manual mapping input: `scripts/data/bond-workspace-manual-mapping.json`
- Cutover exclusions input: `scripts/data/bond-rls-cutover-exclusions.json`

Shadow comparison summary:

- currentAllows_canonicalAllows: 65
- currentAllows_canonicalDenies: 0
- currentDenies_canonicalAllows: 0
- currentDenies_canonicalDenies: 605
- unexpectedAllow: 0
- unexpectedDeny: 0
- excludedAcceptedLegacy: 290
- manualReviewExcluded: 10

Phase 5A go/no-go:

- Ready for Phase 5B scoped policy rollout.
- Scope condition: rows in `acceptedUnresolvedLegacy` and `manualReview` exclusion paths remain legacy-compatible and out of strict canonical enforcement.

## Phase 5B validation close-out

Validation command matrix run:

- `npm run test:workspace-branch-scope`
- `npm run test:role-resolution`
- `npm run test:workspace-resolution`
- `npm run test:unsafe-fallbacks`
- `node scripts/phase5a-bond-rls-shadow-safety.test.mjs`
- `node scripts/bond-rls-shadow-access-report.test.mjs`
- `node scripts/bond-rls-shadow-access-report.mjs`
- `node scripts/bond-rls-shadow-access-report.mjs` with explicit inputs
- `node scripts/phase5b-bond-rls-scoped-policy-safety.test.mjs`
- `node scripts/bond-rls-phase5b-policy-simulation.test.mjs`
- `node scripts/bond-rls-phase5b-policy-simulation.mjs`
- `node scripts/bond-rls-phase5b-policy-simulation.mjs` with explicit inputs
- `npm run build`
- `npm run lint`

Standalone shadow report input:

- `BOND_ASSIGNMENT_RECONCILIATION_INPUT=/tmp/staging-bond-assignment-export.json`
- `BOND_ASSIGNMENT_MANUAL_MAPPING=scripts/data/bond-workspace-manual-mapping.json`
- `BOND_RLS_CUTOVER_EXCLUSIONS=scripts/data/bond-rls-cutover-exclusions.json`
- command: `node scripts/bond-rls-shadow-access-report.mjs`

Standalone phase5b simulation input:

- `BOND_ASSIGNMENT_RECONCILIATION_INPUT=/tmp/staging-bond-assignment-export.json`
- `BOND_ASSIGNMENT_MANUAL_MAPPING=scripts/data/bond-workspace-manual-mapping.json`
- `BOND_RLS_CUTOVER_EXCLUSIONS=scripts/data/bond-rls-cutover-exclusions.json`
- command: `node scripts/bond-rls-phase5b-policy-simulation.mjs`

Standalone shadow report:

- currentAllows_canonicalAllows: 65
- currentAllows_canonicalDenies: 0
- currentDenies_canonicalAllows: 0
- currentDenies_canonicalDenies: 605
- unexpectedAllow: 0
- unexpectedDeny: 0

Standalone phase5b simulation:

- currentAllows_phase5bAllows: 65
- currentAllows_phase5bDenies: 0
- currentDenies_phase5bAllows: 0
- currentDenies_phase5bDenies: 605
- unexpectedAllow: 0
- unexpectedDeny: 0
- excludedLegacyStillAllowed: 13
- canonicalReadyEnforced: 110
- manualReviewExcluded: 10
- acceptedLegacyExcluded: 290

Command outcomes:

- Build: pass
- Global lint: fail (pre-existing baseline failures across unrelated files)
- Targeted Phase 5B lint: pass
- Targeted command: `npx eslint scripts/bond-rls-shadow-access-report.mjs scripts/bond-rls-phase5b-policy-simulation.mjs scripts/phase5b-bond-rls-scoped-policy-safety.test.mjs scripts/bond-rls-phase5b-policy-simulation.test.mjs`

Policy scope confirmed:

- Added canonical scoped read policies only: `transactions`, `transaction_subprocesses`, `transaction_subprocess_steps`, `transaction_finance_details`, `document_requests`, `documents`, `transaction_events`, `transaction_notifications`
- No finance write/update policies changed
- No submit-to-banks write policies changed
- No bank feedback mutation policies changed
- No assignment mutation policies changed
- No document upload write policies changed

Scoped helper confirmation:

- `bridge_is_bond_transaction_canonical_ready`
- `bridge_can_access_bond_transaction_canonical`
- `bridge_can_access_bond_transaction_legacy_compat`
- `bridge_can_access_bond_transaction_phase5b`

Legacy compatibility still active:

- `assigned_bond_originator_email`
- `bond_originator`
- `transaction_participants`
- `transaction_role_players`
- `branchId` / `branch_id` fallback
- `acceptedUnresolvedLegacy` exclusions
- `manualReview` exclusions

Canonical-ready enforcement checks:

- strict canonical behavior applies only when transaction is canonical-ready, has workspace, and is not in cutover exclusions
- excluded rows remain out of strict canonical enforcement: `accepted_unresolved_legacy`, `manual_review`, `legacy_compatibility_required`, `archived_or_inactive`, `not_bond_scoped`

Known gaps:

- interactive role smoke: deferred in this run
- finance write policy expansion: deferred to Phase 5C
- legacy fallback removal: intentionally deferred

Phase 5B recommendation:

- Recommended to proceed to Phase 5C with close monitoring of finance/document/assignment write policy migration.

## Phase 5C write simulation scaffolding

Simulation-only assets added for Bond finance write and workflow mutation planning:

- Shadow helper migration: `202605250021_bond_rls_write_shadow_helpers_phase5c.sql`
- Finance write simulation: `scripts/bond-rls-phase5c-write-simulation.mjs`
- Finance write simulation test: `scripts/bond-rls-phase5c-write-simulation.test.mjs`
- Migration safety test: `scripts/phase5c-bond-write-shadow-safety.test.mjs`

Phase 5C future action model:

- `finance_details_edit`
- `workflow_mutation`
- `document_upload`
- `bank_submission`
- `bank_feedback_capture`
- `assignment_manage`

Phase 5C scope intent:

- simulate future canonical-ready finance write and workflow mutation access
- keep `acceptedUnresolvedLegacy` and `manualReview` rows outside strict canonical write enforcement
- preserve compatibility fallbacks for `assigned_bond_originator_email`, `bond_originator`, `transaction_participants`, `transaction_role_players`, and `branchId` / `branch_id`
- keep personal-originator workspace HQ handling unforced by branch/region requirements

Phase 5C explicit non-goals:

- no production write policy enforcement
- no replacement of existing production mutation RLS
- no legacy fallback removal
- no dashboard UI changes
- no onboarding changes
- no live backfill writes

Phase 5C validation commands to run:

- `node scripts/phase5c-bond-write-shadow-safety.test.mjs`
- `node scripts/bond-rls-phase5c-write-simulation.test.mjs`
- `node scripts/bond-rls-phase5c-write-simulation.mjs`

Phase 5C note:

- This phase adds helper and simulation scaffolding only. Production write RLS remains unchanged until a later enforcement phase.

## Phase 5C Full Validation

Status:
- fail

Commands run:

- `npm run test:workspace-branch-scope`
- `npm run test:role-resolution`
- `npm run test:workspace-resolution`
- `npm run test:unsafe-fallbacks`
- `node scripts/phase5a-bond-rls-shadow-safety.test.mjs`
- `node scripts/bond-rls-shadow-access-report.test.mjs`
- `node scripts/bond-rls-shadow-access-report.mjs`
- `node scripts/phase5b-bond-rls-scoped-policy-safety.test.mjs`
- `node scripts/bond-rls-phase5b-policy-simulation.test.mjs`
- `node scripts/bond-rls-phase5b-policy-simulation.mjs`
- `node scripts/phase5c-bond-write-shadow-safety.test.mjs`
- `node scripts/bond-rls-phase5c-write-simulation.test.mjs`
- `node scripts/bond-rls-phase5c-write-simulation.mjs`
- `npm run build`
- `npm run lint`
- `npx eslint scripts/bond-rls-phase5c-write-simulation.mjs scripts/bond-rls-phase5c-write-simulation.test.mjs scripts/phase5c-bond-write-shadow-safety.test.mjs`

Phase 5A shadow report:

- unexpectedAllow: 0
- unexpectedDeny: 1

Phase 5B read simulation:

- unexpectedAllow: 0
- unexpectedDeny: 1

Phase 5C write simulation summary:

- allowedByCurrent_allowedByCanonical: 782
- allowedByCurrent_deniedByCanonical: 91
- deniedByCurrent_allowedByCanonical: 0
- deniedByCurrent_deniedByCanonical: 8775
- expectedWriteTightening: 91
- expectedCanonicalExpansion: 0
- unexpectedAllow: 0
- unexpectedDeny: 0
- intentionalChanges: 91
- excludedLegacyWriteCompat: 7776
- manualReviewWriteExcluded: 0
- canonicalReadyWriteAllowed: 584
- canonicalReadyWriteDenied: 1288

Build and lint:

- build: pass
- global lint: fail (existing repo baseline debt remains)
- targeted Phase 5C lint: pass

Decision:

- not ready for Phase 5D yet

Guardrails for Phase 5D:

- enforce only canonical-ready rows
- preserve legacy fallbacks
- keep acceptedUnresolvedLegacy excluded
- keep manualReview excluded
- do not remove legacy fields
- do not force branch/region for personal_originator

## Phase 5B-Fix - Read Access Unexpected Deny Close-Out

Starting issue:

- Phase 5A unexpectedDeny: 1
- Phase 5B unexpectedDeny: 1

Root cause:

- The standalone Phase 5A and Phase 5B read simulations were not loading the repo cutover exclusions by default, so transaction `8f157001-0012-4712-8712-000000000012` was evaluated as canonical-ready instead of being classified under the existing `legacy_compatibility_required` exclusion.

Resolution:

- Defaulted the read simulation/report path to load `scripts/data/bond-workspace-manual-mapping.json` and `scripts/data/bond-rls-cutover-exclusions.json` when explicit env overrides are not supplied.
- Added detailed unexpected deny reporting so transaction, actor, role, scope, fallback, and exclusion context are visible in the output.
- Added a regression test covering the excluded legacy compatibility scenario so it stays out of `unexpectedDeny`.

Final read simulation:

- Phase 5A unexpectedAllow: 0
- Phase 5A unexpectedDeny: 0
- Phase 5B unexpectedAllow: 0
- Phase 5B unexpectedDeny: 0

Phase 5C write simulation after fix:

- unexpectedAllow: 0
- unexpectedDeny: 0

Decision:

- ready for Phase 5D

## Phase 5D - Scoped Finance Write Policy Rollout

Policies added:

- `transaction_subprocess_steps_update_phase5d_bond_finance`
- `transaction_finance_details_update_phase5d_bond_finance`
- `document_requests_insert_phase5d_bond_finance`
- `document_requests_update_phase5d_bond_finance`
- `documents_insert_phase5d_bond_finance`
- `documents_update_phase5d_bond_finance`
- `transaction_events_insert_phase5d_bond_finance`
- `transaction_notifications_insert_phase5d_bond_finance`
- `transaction_notifications_update_phase5d_bond_finance`

Tables covered:

- `transaction_subprocess_steps`
- `transaction_finance_details`
- `document_requests`
- `documents`
- `transaction_events`
- `transaction_notifications`

Tables intentionally not covered:

- `transactions`
- `transaction_subprocesses`
- assignment mutation surfaces
- submit-to-bank final enforcement surfaces
- delete surfaces

Excluded rows:

- acceptedUnresolvedLegacy: preserved through canonical-ready gate
- manualReview: preserved through canonical-ready gate
- legacy_compatibility_required: preserved through canonical-ready gate

Simulation:

- unexpectedAllow: 0
- unexpectedDeny: 0
- expectedWriteTightening: 177
- intentionalChanges: 177

Decision:

- ready for Phase 5E

## Phase 5E - Post-RLS Monitoring, Policy Parity & Rollout Stabilisation

Monitoring scripts added:

- `scripts/bond-rls-phase5e-policy-parity-monitor.mjs`
- `scripts/bond-rls-phase5e-policy-parity-monitor.test.mjs`
- `scripts/phase5e-bond-rls-post-rollout-safety.test.mjs`

Post-rollout safety summary:

- Phase 5B scoped read policies remain additive and scoped
- Phase 5D scoped write policies remain additive and scoped
- No delete policies were added on the Phase 5D target tables
- Submit-to-bank final enforcement remains deferred
- Assignment mutation enforcement remains deferred
- Legacy fallbacks remain intact
- `acceptedUnresolvedLegacy` remains excluded
- `manualReview` remains excluded
- `personal_originator` remains branchless

Policy overlap audit:

- `transaction_subprocess_steps`
  - select: `transaction_subprocess_steps_select_phase5b_scoped`
  - update: `transaction_subprocess_steps_update_phase5d_bond_finance`
  - insert/delete: none
- `transaction_finance_details`
  - select: `transaction_finance_details_select_phase5b_scoped`
  - update: `transaction_finance_details_update_phase5d_bond_finance`
  - insert/delete: none
- `document_requests`
  - select: `document_requests_select_phase5b_scoped`
  - insert: `document_requests_insert_phase5d_bond_finance`
  - update: `document_requests_update_phase5d_bond_finance`
  - delete: none
- `documents`
  - select: `documents_select_phase5b_scoped`
  - insert: `documents_insert_phase5d_bond_finance`
  - update: `documents_update_phase5d_bond_finance`
  - delete: none
- `transaction_events`
  - select: `transaction_events_select_phase5b_scoped`
  - insert: `transaction_events_insert_phase5d_bond_finance`
  - update/delete: none
- `transaction_notifications`
  - select: `transaction_notifications_select_phase5b_scoped`
  - insert: `transaction_notifications_insert_phase5d_bond_finance`
  - update: `transaction_notifications_update_phase5d_bond_finance`
  - delete: none
- Broad permissive overlap on the Phase 5D target tables: none detected in migration audit

Read parity:

- unexpectedReadAllow: 0
- unexpectedReadDeny: 0

Write parity:

- unexpectedWriteAllow: 0
- unexpectedWriteDeny: 0

Excluded rows:

- acceptedUnresolvedLegacy preserved: yes
- manualReview preserved: yes
- legacy compatibility preserved: yes

UI and workflow smoke:

- dashboard: pass
- queues: pass
- finance workflow: pass
- document requests: pass
- write denial handling: pass
- staging smoke: pending runtime verification (`playwright/.auth/staging-internal.json` is present, but no dedicated live Phase 5E browser workflow verifier was run in this phase)

Validation:

- `npm run test:workspace-branch-scope`: pass
- `npm run test:role-resolution`: pass
- `npm run test:workspace-resolution`: pass
- `npm run test:unsafe-fallbacks`: pass
- `node scripts/phase5a-bond-rls-shadow-safety.test.mjs`: pass
- `node scripts/bond-rls-shadow-access-report.test.mjs`: pass
- `node scripts/bond-rls-shadow-access-report.mjs`: pass
- `node scripts/phase5b-bond-rls-scoped-policy-safety.test.mjs`: pass
- `node scripts/bond-rls-phase5b-policy-simulation.test.mjs`: pass
- `node scripts/bond-rls-phase5b-policy-simulation.mjs`: pass
- `node scripts/phase5c-bond-write-shadow-safety.test.mjs`: pass
- `node scripts/bond-rls-phase5c-write-simulation.test.mjs`: pass
- `node scripts/bond-rls-phase5c-write-simulation.mjs`: pass
- `node scripts/phase5d-bond-finance-write-policy-safety.test.mjs`: pass
- `node scripts/bond-rls-phase5d-write-policy-simulation.test.mjs`: pass
- `node scripts/bond-rls-phase5d-write-policy-simulation.mjs`: pass
- `node scripts/phase5e-bond-rls-post-rollout-safety.test.mjs`: pass
- `node scripts/bond-rls-phase5e-policy-parity-monitor.test.mjs`: pass
- `node scripts/bond-rls-phase5e-policy-parity-monitor.mjs`: pass
- `npm run build`: pass
- `npm run lint`: fail from existing repo baseline debt outside the Bond Phase 5 rollout
- targeted Phase 5E lint: pass

Decision:

- ready for Phase 5F

## Phase 5F - Submit-to-Bank and Assignment Mutation Simulation

Migration added:

- `202605250023_bond_sensitive_mutation_shadow_helpers_phase5f.sql`

Sensitive mutation actions:

- `bond.submit_to_banks`
- `bond.revoke_bank_submission`
- `bond.resubmit_to_banks`
- `bond.assign_workspace`
- `bond.assign_region`
- `bond.assign_unit`
- `bond.assign_consultant`
- `bond.assign_processor`
- `bond.assign_manager`
- `bond.assign_compliance`
- `bond.clear_assignment`
- `bond.transfer_application_workspace`
- `bond.override_assignment_scope`

Simulation assets:

- `scripts/bond-rls-phase5f-sensitive-mutation-simulation.mjs`
- `scripts/bond-rls-phase5f-sensitive-mutation-simulation.test.mjs`
- `scripts/phase5f-bond-sensitive-mutation-shadow-safety.test.mjs`

Submit-to-bank simulation:

- submit, revoke, and resubmit are modeled as sensitive canonical-ready mutations
- workspace HQ roles remain eligible by default
- regional, branch, team, consultant, and processor paths require explicit submit permission plus in-scope ownership
- compliance, admin staff, participant-only, and unrelated users remain denied by default

Assignment mutation simulation:

- workspace HQ roles can mutate assignment within workspace
- regional managers can mutate assignment only within region
- branch managers and team leads can mutate assignment only within unit
- consultants, processors, compliance, admin staff, participant-only, and unrelated users do not receive sensitive assignment mutation by default
- workspace transfer and assignment-scope override remain simulated only, with transfer still treated as explicitly gated

Assignment write path audit:

- canonical writes:
  - `src/services/bondAssignmentService.js`
  - `updateTransactionAssignmentFields` writes `transactions` canonical fields:
    - `bond_workspace_id`
    - `bond_region_id`
    - `bond_workspace_unit_id`
    - `primary_bond_consultant_user_id`
    - `assigned_bond_processor_user_id`
    - `assigned_bond_manager_user_id`
    - `assigned_bond_compliance_user_id`
    - `bond_assignment_status`
    - `bond_assignment_source`
    - `bond_assignment_updated_at`
    - `bond_assignment_updated_by`
- legacy writes:
  - `src/services/bondAssignmentService.js`
  - `syncLegacyBondAssignmentColumns` writes:
    - `assigned_bond_originator_email`
    - `bond_originator`
- participant writes:
  - no Bond-specific assignment dual-write into `transaction_participants` was found in the audited Bond assignment service path
  - broader participant maintenance still exists in `src/lib/api.js` for generic transaction participant flows
- role-player writes:
  - `src/services/bondAssignmentService.js`
  - `syncTransactionRolePlayer` upserts `transaction_role_players`
  - roles synced:
    - `bond_originator`
    - `processor`
    - `manager`
    - `compliance`
- events and notifications:
  - no dedicated Bond assignment event/notification dual-write was found in the audited Bond assignment service path
  - generic transaction event and notification writers still exist elsewhere, including `src/lib/api.js`
- permission and ownership checks audited:
  - `src/auth/permissions/permissionResolver.js`
  - `src/services/bondFinanceWorkflowOwnershipService.js`

Simulation results:

- `currentAllows_phase5fAllows`: 424
- `currentAllows_phase5fDenies`: 629
- `currentDenies_phase5fAllows`: 0
- `currentDenies_phase5fDenies`: 741
- `expectedSensitiveTightening`: 278
- `expectedCanonicalExpansion`: 0
- `unexpectedAllow`: 0
- `unexpectedDeny`: 0
- `excludedLegacyMutationCompat`: 351
- `manualReviewMutationExcluded`: 130
- `canonicalReadyMutationAllowed`: 424
- `canonicalReadyMutationDenied`: 889

Validation:

- `npm run test:workspace-branch-scope`: pass
- `npm run test:role-resolution`: pass
- `npm run test:workspace-resolution`: pass
- `npm run test:unsafe-fallbacks`: pass
- `node scripts/phase5a-bond-rls-shadow-safety.test.mjs`: pass
- `node scripts/bond-rls-shadow-access-report.test.mjs`: pass
- `node scripts/bond-rls-shadow-access-report.mjs`: pass
- `node scripts/phase5b-bond-rls-scoped-policy-safety.test.mjs`: pass
- `node scripts/bond-rls-phase5b-policy-simulation.test.mjs`: pass
- `node scripts/bond-rls-phase5b-policy-simulation.mjs`: pass
- `node scripts/phase5c-bond-write-shadow-safety.test.mjs`: pass
- `node scripts/bond-rls-phase5c-write-simulation.test.mjs`: pass
- `node scripts/bond-rls-phase5c-write-simulation.mjs`: pass
- `node scripts/phase5d-bond-finance-write-policy-safety.test.mjs`: pass
- `node scripts/bond-rls-phase5d-write-policy-simulation.test.mjs`: pass
- `node scripts/bond-rls-phase5d-write-policy-simulation.mjs`: pass
- `node scripts/phase5e-bond-rls-post-rollout-safety.test.mjs`: pass
- `node scripts/bond-rls-phase5e-policy-parity-monitor.test.mjs`: pass
- `node scripts/bond-rls-phase5e-policy-parity-monitor.mjs`: pass
- `node scripts/phase5f-bond-sensitive-mutation-shadow-safety.test.mjs`: pass
- `node scripts/bond-rls-phase5f-sensitive-mutation-simulation.test.mjs`: pass
- `node scripts/bond-rls-phase5f-sensitive-mutation-simulation.mjs`: pass
- `npm run build`: pass
- `npm run lint`: fail from existing repo baseline debt outside the Bond Phase 5 rollout
- targeted Phase 5F lint: pass

Decision:

- ready for Phase 5G scoped sensitive mutation rollout

## Phase 5G - Scoped Sensitive Mutation Policy Rollout

Current mutation policies inspected:

- `transactions`:
  - existing Bond policies before Phase 5G:
    - `transactions_select_phase5b_scoped`
  - no existing Bond `insert`, `update`, or `delete` policies were present before Phase 5G
- `transaction_participants`:
  - no Bond mutation policies found during the Phase 5G audit
- `transaction_role_players`:
  - no Bond mutation policies found during the Phase 5G audit
- `transaction_events`:
  - existing Bond policies before Phase 5G:
    - `transaction_events_select_phase5b_scoped`
    - `transaction_events_insert_phase5d_bond_finance`
- `transaction_notifications`:
  - existing Bond policies before Phase 5G:
    - `transaction_notifications_select_phase5b_scoped`
    - `transaction_notifications_insert_phase5d_bond_finance`
    - `transaction_notifications_update_phase5d_bond_finance`
- `document_requests`:
  - existing Bond policies before Phase 5G:
    - `document_requests_select_phase5b_scoped`
    - `document_requests_insert_phase5d_bond_finance`
    - `document_requests_update_phase5d_bond_finance`
- `transaction_finance_details`:
  - existing Bond policies before Phase 5G:
    - `transaction_finance_details_select_phase5b_scoped`
    - `transaction_finance_details_update_phase5d_bond_finance`

Policies added:

- `transactions_update_phase5g_bond_sensitive_mutation`
- `transaction_role_players_insert_phase5g_bond_sensitive_mutation`
- `transaction_role_players_update_phase5g_bond_sensitive_mutation`

Sensitive helpers added:

- `bridge_can_submit_bond_to_banks_phase5g`
- `bridge_can_revoke_bond_bank_submission_phase5g`
- `bridge_can_resubmit_bond_to_banks_phase5g`
- `bridge_can_assign_bond_workspace_phase5g`
- `bridge_can_assign_bond_region_phase5g`
- `bridge_can_assign_bond_unit_phase5g`
- `bridge_can_assign_bond_consultant_phase5g`
- `bridge_can_assign_bond_processor_phase5g`
- `bridge_can_assign_bond_manager_phase5g`
- `bridge_can_assign_bond_compliance_phase5g`
- `bridge_can_clear_bond_assignment_phase5g`
- `bridge_can_transfer_bond_application_workspace_phase5g`
- `bridge_can_override_bond_assignment_scope_phase5g`
- `bridge_can_mutate_bond_assignment_phase5g`
- `bridge_can_mutate_bond_sensitive_transaction_phase5g`

Sensitive actions enforced:

- `bond.submit_to_banks`
- `bond.revoke_bank_submission`
- `bond.resubmit_to_banks`
- `bond.assign_workspace`
- `bond.assign_region`
- `bond.assign_unit`
- `bond.assign_consultant`
- `bond.assign_processor`
- `bond.assign_manager`
- `bond.assign_compliance`
- `bond.clear_assignment`
- `bond.transfer_application_workspace`
- `bond.override_assignment_scope`

Sensitive actions intentionally not enforced:

- no actions from the Phase 5F catalog were omitted
- `bond.transfer_application_workspace` remains enforced as deny-by-default without a new explicit HQ grant path
- dedicated `transaction_participants` mutation, and dedicated assignment event/notification dual-write surfaces remain deferred because the audited Bond assignment path does not currently depend on them

Assignment write path impact:

- enforced table surface:
  - `transactions` update path now requires Phase 5G sensitive mutation scope/permission checks for canonical-ready, non-excluded rows
  - `transaction_role_players` insert/update now follows the same assignment mutation gate when the role-player sync path is present
- unchanged compatibility paths:
  - `syncLegacyBondAssignmentColumns` still preserves `assigned_bond_originator_email`
  - `syncLegacyBondAssignmentColumns` still preserves `bond_originator`
  - `transaction_participants` fallback remains untouched
  - `acceptedUnresolvedLegacy`, `manualReview`, and `legacy_compatibility_required` exclusions remain on the compatibility path

Simulation:

- `currentAllows_phase5gAllows`: 424
- `currentAllows_phase5gDenies`: 629
- `currentDenies_phase5gAllows`: 0
- `currentDenies_phase5gDenies`: 741
- `unexpectedAllow`: 0
- `unexpectedDeny`: 0
- `expectedSensitiveTightening`: 278
- `expectedCanonicalExpansion`: 0
- `phase5gCanonicalReadyEnforced`: 1313
- `phase5gLegacyExcluded`: 351
- `manualReviewMutationExcluded`: 130

Validation:

- `npm run test:workspace-branch-scope`: pass
- `npm run test:role-resolution`: pass
- `npm run test:workspace-resolution`: pass
- `npm run test:unsafe-fallbacks`: pass
- `node scripts/phase5a-bond-rls-shadow-safety.test.mjs`: pass
- `node scripts/bond-rls-shadow-access-report.test.mjs`: pass
- `node scripts/bond-rls-shadow-access-report.mjs`: pass
- `node scripts/phase5b-bond-rls-scoped-policy-safety.test.mjs`: pass
- `node scripts/bond-rls-phase5b-policy-simulation.test.mjs`: pass
- `node scripts/bond-rls-phase5b-policy-simulation.mjs`: pass
- `node scripts/phase5c-bond-write-shadow-safety.test.mjs`: pass
- `node scripts/bond-rls-phase5c-write-simulation.test.mjs`: pass
- `node scripts/bond-rls-phase5c-write-simulation.mjs`: pass
- `node scripts/phase5d-bond-finance-write-policy-safety.test.mjs`: pass
- `node scripts/bond-rls-phase5d-write-policy-simulation.test.mjs`: pass
- `node scripts/bond-rls-phase5d-write-policy-simulation.mjs`: pass
- `node scripts/phase5e-bond-rls-post-rollout-safety.test.mjs`: pass
- `node scripts/bond-rls-phase5e-policy-parity-monitor.test.mjs`: pass
- `node scripts/bond-rls-phase5e-policy-parity-monitor.mjs`: pass
- `node scripts/phase5f-bond-sensitive-mutation-shadow-safety.test.mjs`: pass
- `node scripts/bond-rls-phase5f-sensitive-mutation-simulation.test.mjs`: pass
- `node scripts/bond-rls-phase5f-sensitive-mutation-simulation.mjs`: pass
- `node scripts/phase5g-bond-sensitive-mutation-policy-safety.test.mjs`: pass
- `node scripts/bond-rls-phase5g-sensitive-mutation-policy-simulation.test.mjs`: pass
- `node scripts/bond-rls-phase5g-sensitive-mutation-policy-simulation.mjs`: pass
- `npm run build`: pass
- `npm run lint`: fail from existing repo baseline debt outside the Bond Phase 5 rollout
- targeted Phase 5G lint: pass

Decision:

- ready for Phase 5H

## Phase 5H — Live/Staging Runtime Verification & Policy Error Handling

Status:

- fail

Runtime fixture findings:

- Saved staging auth state resolves to `qa.attorney+canonical@arch9.co.za`, the canonical-document QA fixture account, not a Bond role matrix account.
- Saved staging auth token expires at `2026-05-26T10:58:05.000Z`, so the stored browser session is stale for runtime verification.
- Direct Supabase password sign-in with the current `.env.staging.local` credentials returns `Invalid login credentials`.
- `scripts/export-bond-assignment-staging.mjs` still reports `No live bond organisations were found in staging export. Synthetic fixtures were used for Phase 4D smoke coverage.`
- `scripts/export-bond-assignment-staging.mjs` also warns that branch/regional smoke cannot be completed from live staging data alone when regions or units are missing.

Runtime accounts tested:

- personal_originator: blocked
- consultant: blocked
- processor: blocked
- compliance: blocked
- branch manager: blocked
- regional manager: blocked
- HQ / owner / director: blocked
- participant-only: blocked
- unrelated user: blocked

Dashboard smoke:

- blocked by missing valid Bond staging login/session and missing live Bond workspace coverage

Mutation smoke:

- finance workflow: blocked
- document requests: blocked
- documents: blocked
- bank feedback: blocked
- submit-to-bank: blocked
- assignment mutation: blocked

Workspace switching:

- blocked

Denied action handling:

- Clear permission messages exist in `src/lib/api.js` for document request and ownership/access-level denial paths.
- Generic permission telemetry exists through `trackPermissionMetric` in `src/services/observability/monitoring.js`.
- Structured Bond denial logging with the full requested runtime payload (`user_id`, `workspace_id`, `transaction_id`, `action_key`, `workspace_role`, `scope_level`, `region_id`, `workspace_unit_id`, `policy_path`, `denial_reason`, `timestamp`) is not yet verified in a live staging session.

Legacy compatibility:

- No script-level regression evidence was found across Phase 5A through Phase 5G validation.
- Live verification of `assigned_bond_originator_email`, `bond_originator`, `transaction_participants`, `transaction_role_players`, `acceptedUnresolvedLegacy`, `manualReview`, and `branchId` / `branch_id` compatibility remains blocked pending valid staging fixtures.

Decision:

- not ready for Phase 6 or Phase 5I

Required unblockers:

- provision live Bond staging users for the full Phase 5H role matrix
- create or identify live Bond staging applications covering canonical-ready and excluded paths
- refresh the staging auth bootstrap so it can establish a valid Bond session in browser/runtime verification
