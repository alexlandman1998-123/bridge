# Supabase Production One-Version Promotion

Generated: 2026-07-29T19:45:16.503Z

## Selected Version

| Field | Value |
| --- | --- |
| Status | `PROMOTION_BLOCKED` |
| Mode | `plan` |
| Version | `202607270013` |
| Stream | `legal_document_runtime` |
| Route | `production_no_sql_record_after_smoke` |
| Ready from Phase 5 | No |
| Mutation attempted | No |
| Mutation succeeded | Not attempted |

## Blockers

- `phase5_production_promotion_not_ready`
- `phase5_staging_evidence_missing`

## Commands

No commands are enabled for this selected version.

Use this wrapper for one migration version at a time. It delegates mutations to `scripts/supabase-phase7-production-execution.mjs` only after Phase 5 marks the selected version ready.
