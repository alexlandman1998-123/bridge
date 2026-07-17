# Outstanding migrations Phase 6: bond milestone assurance

Date: 2026-07-17
Migration: `202607050001_bond_grant_workflow_milestones`
Method: read-only linked-database inspection and focused application tests

## Outcome

The bond grant milestone migration is fully present in the live schema and its exact raw-ledger row exists. Phase 6 did not replay the migration and did not alter schema or production data.

| Gate | Result |
| --- | --- |
| Schema contract complete | Yes |
| Milestone columns | 11/11 exact |
| Partial queue indexes | 2/2 exact |
| Workflow stage/event constraints | 4/4 include all three grant milestones |
| Milestone foreign keys | 5/5 exact, with `ON DELETE SET NULL` |
| Exact raw-ledger row | Present |
| Data integrity anomalies | 0 |
| 6 focused application suites | Passed |

## Live data checks

The assurance query found zero rows in each inconsistent state:

- signed before received;
- submitted before signed;
- received flag/timestamp mismatch;
- signed flag/timestamp mismatch;
- submitted flag/timestamp mismatch.

These are assurance checks, not new database constraints. Existing application behavior remains responsible for recording the milestone flags and timestamps together.

## Application verification

The following suites passed against the checked-in workflow implementation:

- `bondOperationalQueueService.test.js`
- `bondOperationalDiagnosticsService.test.js`
- `phase4-bond-dashboard-safety.test.mjs`
- `verify-attorney-workflow-lanes.mjs`
- `verify-attorney-workflow-phase0.mjs`
- `bondBankRelationshipService.test.js`

The reusable live gate is `sql/outstanding-migrations-phase6-bond-assurance.sql`. It reads catalogs, the migration ledger, and milestone consistency counts only.

## Decision

`PHASE_6_BOND_ASSURANCE_COMPLETE`

No remediation or migration replay is required for `202607050001`. The isolated security migration `202607070001_drop_demo_all_rls_grants.sql` remains outside this phase and should retain its dedicated review and rollout gate.
