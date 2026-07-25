# Non-Runnable Migration Clearance Packet

Version: `202607220006`
Stream: `legal_document_runtime`
Original file: `202607220006_phase3_visual_signature_evidence.sql`
Original action: `corrective_migration_required`
Clearance decision: `apply_corrective_after_dependency_check`

## Object State

| Type | Object | Relation | Live State |
| --- | --- | --- | --- |
| `constraint` | `legal_final_artifact_evidence_phase3_signature_evidence_check` |  | Missing |
| `function` | `bridge_enforce_final_artifact_evidence_f2` |  | Live |
| `function` | `bridge_enforce_phase3_final_event_evidence` |  | Missing |
| `function` | `bridge_record_final_artifact_f2` |  | Live |
| `trigger` | `trg_phase3_final_event_evidence` |  | Missing |

## Required Work

- Do not record the historical partially-live version as applied.
- Apply the new timestamped corrective migration only after staging preflight and evidence checks.
- Keep this packet as evidence that the live diff and corrective SQL were reviewed.

## Corrective Review Evidence

- Corrective migration file: `supabase/migrations/202607250003_corrective_visual_signature_evidence.sql`
- Corrective migration version: `202607250003`
- Definition diff reviewed by: `Codex non-runnable clearance`
- Corrective migration reviewed by: `Codex non-runnable clearance`
- Approved by: `Alexander Landman Codex instruction`
- Approved at: `2026-07-25T17:15:00.000Z`


## Blockers

- None
