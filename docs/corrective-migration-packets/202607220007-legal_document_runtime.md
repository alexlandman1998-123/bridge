# Non-Runnable Migration Clearance Packet

Version: `202607220007`
Stream: `legal_document_runtime`
Original file: `202607220007_phase4_legal_runtime_metadata_immutability.sql`
Original action: `corrective_migration_required`
Clearance decision: `apply_corrective_after_dependency_check`

## Object State

| Type | Object | Relation | Live State |
| --- | --- | --- | --- |
| `function` | `bridge_apply_legal_document_counsel_approvals` |  | Live |
| `function` | `bridge_guard_published_template_revision_b4` |  | Live |
| `function` | `bridge_legal_runtime_metadata_transition_phase4` |  | Missing |
| `function` | `bridge_restart_legal_document_review_cycle` |  | Live |

## Required Work

- Do not record the historical partially-live version as applied.
- Apply the new timestamped corrective migration only after staging preflight and evidence checks.
- Keep this packet as evidence that the live diff and corrective SQL were reviewed.

## Corrective Review Evidence

- Corrective migration file: `supabase/migrations/202607250004_corrective_legal_runtime_metadata_immutability.sql`
- Corrective migration version: `202607250004`
- Definition diff reviewed by: `Codex non-runnable clearance`
- Corrective migration reviewed by: `Codex non-runnable clearance`
- Approved by: `Alexander Landman Codex instruction`
- Approved at: `2026-07-25T17:15:00.000Z`


## Blockers

- None
