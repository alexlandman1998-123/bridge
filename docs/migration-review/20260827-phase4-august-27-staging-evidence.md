# August 27 Supabase Staging Evidence Capture

Generated: 2026-08-27T14:45:59Z  
Repo: `/Users/alexanderlandman/the-it-guy`

## Scope

This is the phase 4 staging-evidence capture layer for the August 27 migration batch. It is read-only. It does not apply SQL, record ledger rows, relink Supabase, or modify production.

Phase 4 captures evidence files for the runner-eligible rows from phase 3:

- `apply_original_after_dependency_check`
- `repair_only_after_smoke`

The bond-originator handoff pair is excluded from runner capture until it is consolidated into one canonical packet.

## Decision

| Field | Value |
| --- | ---: |
| Runner-eligible rows | 6 |
| Evidence files created | 6 |
| Evidence files existing | 0 |
| Complete evidence rows | 0 |
| Pending evidence rows | 6 |
| Excluded consolidate rows | 2 |

## Routes

| Route | Rows |
| --- | ---: |
| `apply_original_after_dependency_check` | 3 |
| `repair_only_after_smoke` | 3 |

## Evidence Files

| Version | Stream | Route | Status | File State | Evidence File | Blockers |
| --- | --- | --- | --- | --- | --- | --- |
| `20260827102857` | `transaction_network` | `apply_original_after_dependency_check` | Pending | Created | `docs/staging-evidence/20260827102857-transaction_network.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending`<br>`captured_at_pending` |
| `20260827113000` | `notification_automation` | `apply_original_after_dependency_check` | Pending | Created | `docs/staging-evidence/20260827113000-notification_automation.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending`<br>`captured_at_pending` |
| `20260827124137` | `attorney_identity_access` | `apply_original_after_dependency_check` | Pending | Created | `docs/staging-evidence/20260827124137-attorney_identity_access.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending`<br>`captured_at_pending` |
| `20260827104557` | `attorney_workflow_runtime` | `repair_only_after_smoke` | Pending | Created | `docs/staging-evidence/20260827104557-attorney_workflow_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending`<br>`captured_at_pending` |
| `20260827133916` | `transaction_network` | `repair_only_after_smoke` | Pending | Created | `docs/staging-evidence/20260827133916-transaction_network.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending`<br>`captured_at_pending` |
| `20260827151119` | `bond_finance_runtime` | `repair_only_after_smoke` | Pending | Created | `docs/staging-evidence/20260827151119-bond_finance_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending`<br>`captured_at_pending` |

## Excluded Consolidation Pair

These rows are not runner-eligible yet because they should become one canonical packet first:

- `20260827133506_repair_missing_roleplayer_bond_handoffs.sql`
- `20260827133739_repair_missing_roleplayer_bond_handoffs_execution.sql`

## Completion Rule

An evidence file is complete only when it has the real staging project ref, expected `sqlApplied` value, `stagingLedgerRecorded: true`, passing catalog/behavior/rollback checks, and both reviewer and approver names.

