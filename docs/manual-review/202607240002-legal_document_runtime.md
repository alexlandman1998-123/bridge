# Non-Runnable Migration Clearance Packet

Version: `202607240002`
Stream: `legal_document_runtime`
Original file: `202607240002_global_mandate_platform_default_phase2.sql`
Original action: `manual_data_review`
Clearance decision: `apply_original_after_dependency_check`

## Object State

No static objects were extracted from this migration.

## Required Work

- Verify the selected global native mandate starter is the intended platform default.
- If the live outcome is not compliant and the selected template passes section/signature/wording checks, route this row to apply the original data migration in staging.
- If the live outcome is already compliant, route this row to repair-only after smoke evidence.

## Manual Review Evidence

- Candidate count: `2`
- Compliant active defaults: `0`
- Selected template: `401bcf78-bb16-4c34-a571-76c19a3c153a`
- Selected sections: `16`
- Selected signature sections: `1`
- Selected bad wording count: `0`
- Approved by: `Alexander Landman Codex instruction`
- Approved at: `2026-07-25T17:15:00.000Z`


## Blockers

- None
