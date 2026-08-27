# Supabase Migration Phase 5 Module Drift Report

Generated: 2026-08-27T14:06:52.830Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 5 is read-only. It classifies the remaining migration ledger drift by module and performs catalog-only object checks for local-only migrations. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | BLOCKED_DUPLICATES |
| Local migration files | 732 |
| Duplicate local timestamps | 2 |
| Remote ledger fetched | yes |
| Matched rows | 0 |
| Split local/remote versions | 0 |
| Reviewed split baseline | 0 |
| Unreviewed split versions | 0 |
| Pure local-only rows | 0 |
| Pure remote-only rows | 0 |
| Application manifest rows | 0 |
| Extracted objects checked | 0 |

## Module Summary

No module drift rows were available. Run `npm run supabase:phase5` to fetch the remote ledger.

## Split Ledger Rows

No split local/remote versions detected.

## Reviewed Repair Candidates

No pure local-only migration is ready for repair from static object evidence alone.

## Needs Object Review

No pure local-only migrations had partial or missing static object evidence.

## Application Manifest

No pure local-only migrations were available for manifest generation.

## Local-Only Drift Detail

No local-only drift rows were available.

## Object Extraction

| Metric | Value |
| --- | --- |
| Static objects extracted | 0 |
| Catalog rows returned | 0 |
| Object check command | not run |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| supabase migration list --linked --output-format json | failed (1) | Initialising login role... |
| object catalog check not run | skipped | no extracted objects |

## Next Step

Run Phase 4 again before continuing; duplicate local timestamps are still present.

