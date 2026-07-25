# Non-Runnable Migration Clearance Packet

Version: `202607220004`
Stream: `legal_document_runtime`
Original file: `202607220004_canonical_otp_signing_phase2.sql`
Original action: `corrective_migration_required`
Clearance decision: `apply_corrective_after_dependency_check`

## Object State

| Type | Object | Relation | Live State |
| --- | --- | --- | --- |
| `function` | `bridge_authorize_applied_envelope_dispatch_e4` |  | Live |
| `function` | `bridge_complete_editable_render_freeze_c4` |  | Live |
| `function` | `bridge_enforce_otp_canonical_document_link_authority_phase2` |  | Missing |
| `function` | `bridge_enforce_otp_canonical_version_authority_phase2` |  | Missing |
| `function` | `bridge_enforce_otp_transaction_before_signing_phase2` |  | Missing |
| `function` | `bridge_record_final_artifact_f2` |  | Live |
| `function` | `bridge_record_otp_signing_delivery_phase2` |  | Missing |
| `function` | `bridge_seal_canonical_otp_pdf_phase2` |  | Missing |
| `trigger` | `trg_otp_canonical_document_link_authority_phase2` |  | Missing |
| `trigger` | `trg_otp_canonical_version_authority_phase2` |  | Missing |
| `trigger` | `trg_otp_transaction_before_signing_phase2` |  | Missing |

## Required Work

- Do not record the historical partially-live version as applied.
- Apply the new timestamped corrective migration only after staging preflight and evidence checks.
- Keep this packet as evidence that the live diff and corrective SQL were reviewed.

## Corrective Review Evidence

- Corrective migration file: `supabase/migrations/202607250002_corrective_canonical_otp_signing_phase2.sql`
- Corrective migration version: `202607250002`
- Definition diff reviewed by: `Codex non-runnable clearance`
- Corrective migration reviewed by: `Codex non-runnable clearance`
- Approved by: `Alexander Landman Codex instruction`
- Approved at: `2026-07-25T17:15:00.000Z`


## Blockers

- None
