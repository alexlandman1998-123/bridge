# Supabase Migration Phase 6 Split Ledger Investigation Report

Generated: 2026-09-06T16:00:06.163Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 6 is read-only. It investigates split local/remote migration versions from Phase 5, checks the live catalog for objects declared by those local migration files, and reads `supabase_migrations.schema_migrations` metadata. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | SPLIT_BASELINE_READY |
| Local migration files | 989 |
| Duplicate local timestamps | 0 |
| Remote ledger fetched | yes |
| Matched rows | 895 |
| Split versions investigated | 1 |
| All static objects live | 1 |
| Partial static objects live | 0 |
| No static objects extracted | 0 |
| Remote migration names matched | 1 |
| Remote migration names unavailable | 0 |
| Reviewed split exceptions | 0 |
| Static objects checked | 1 |

## Module Summary

| Module | Split Rows | All Live | Partial Live | None Live | No Static Objects | Name Matches | Name Unavailable | Reviewed Exceptions | Review Required |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lead_capture_crm | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |

## Object Review Required

No split rows had partial or missing static object evidence.

## Manual SQL Review

No split rows required manual SQL review because of empty static object extraction.

## Reviewed Split Exceptions

No reviewed split exception matched its expected evidence signature.

## Metadata Name Drift

No split row exposed a remote migration name that differed from the local file name.

## Split Row Detail

| Version | Module | Local File | Remote Name | Name Status | Object Status | Objects Live | Statements | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 202609030001 | lead_capture_crm | 202609030001_header_lead_notification_source.sql | header_lead_notification_source | remote_name_matches | all_live | 1/1 | 1 | confirmed_live_split |

## Object Extraction

| Metric | Value |
| --- | --- |
| Static objects extracted | 1 |
| Catalog rows returned | 1 |
| Object check command | ok |
| History metadata command | ok |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /var/folders/r_/zbzvf7r10897f7jqjfy4sfvh0000gn/T/supabase-phase6-history-61458.sql --output-format json | ok | Initialising login role... |
| npx supabase db query --linked --file /var/folders/r_/zbzvf7r10897f7jqjfy4sfvh0000gn/T/supabase-phase6-object-checks-61458.sql --output-format json | ok | Initialising login role... |

## Next Step

Treat split rows as already remote-recorded and leave them out of repair batches. Continue with the smallest pure-local-only module batch that has live-object and smoke-test evidence.

