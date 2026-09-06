# Supabase Production One-Version Promotion

Generated: 2026-09-06T17:34:59.883Z

## Selected Version

| Field | Value |
| --- | --- |
| Status | `PROMOTION_MUTATION_SUCCEEDED` |
| Mode | `record_applied` |
| Version | `20260818203652` |
| Stream | `other` |
| Route | `production_no_sql_record_after_smoke` |
| Ready from Phase 5 | Yes |
| Mutation attempted | Yes |
| Mutation succeeded | Yes |

## Blockers

None

## Commands

- `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260818203652 --staging-evidence docs/staging-evidence/20260818203652-other.json --production-evidence docs/production-evidence/20260818203652-other.json --confirm APPLY_TO_PRODUCTION`

Use this wrapper for one migration version at a time. It delegates mutations to `scripts/supabase-phase7-production-execution.mjs` only after Phase 5 marks the selected version ready.
