# Supabase Production One-Version Promotion

Generated: 2026-07-29T20:22:48.693Z

## Selected Version

| Field | Value |
| --- | --- |
| Status | `PROMOTION_READY` |
| Mode | `plan` |
| Version | `202607270013` |
| Stream | `legal_document_runtime` |
| Route | `production_no_sql_record_after_smoke` |
| Ready from Phase 5 | Yes |
| Mutation attempted | No |
| Mutation succeeded | Not attempted |

## Blockers

None

## Commands

- `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607270013 --staging-evidence docs/staging-evidence/202607270013-legal_document_runtime.json --production-evidence docs/production-evidence/202607270013-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION`

Use this wrapper for one migration version at a time. It delegates mutations to `scripts/supabase-phase7-production-execution.mjs` only after Phase 5 marks the selected version ready.
