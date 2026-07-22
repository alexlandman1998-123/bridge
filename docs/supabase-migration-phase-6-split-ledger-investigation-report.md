# Supabase Migration Phase 6 Split Ledger Investigation Report

Generated: 2026-07-20T09:22:01.210Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 6 is read-only. It investigates split local/remote migration versions from Phase 5, checks the live catalog for objects declared by those local migration files, and reads `supabase_migrations.schema_migrations` metadata. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | REMOTE_CHECK_FAILED |
| Local migration files | 497 |
| Duplicate local timestamps | 0 |
| Remote ledger fetched | yes |
| Matched rows | 0 |
| Split versions investigated | 0 |
| All static objects live | 0 |
| Partial static objects live | 0 |
| No static objects extracted | 0 |
| Remote migration names matched | 0 |
| Remote migration names unavailable | 0 |
| Reviewed split exceptions | 0 |
| Static objects checked | 0 |

## Module Summary

No split rows were available. Run `npm run supabase:phase6` to fetch the remote ledger.

## Object Review Required

No split rows had partial or missing static object evidence.

## Manual SQL Review

No split rows required manual SQL review because of empty static object extraction.

## Reviewed Split Exceptions

No reviewed split exception matched its expected evidence signature.

## Metadata Name Drift

No split row exposed a remote migration name that differed from the local file name.

## Split Row Detail

No split local/remote versions were available.

## Object Extraction

| Metric | Value |
| --- | --- |
| Static objects extracted | 0 |
| Catalog rows returned | 0 |
| Object check command | not run |
| History metadata command | not run |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | failed (1) | Initialising login role... |
| history metadata check not run | skipped | not run |
| object catalog check not run | skipped | no extracted objects |

## Next Step

Inspect failed command evidence before continuing.

