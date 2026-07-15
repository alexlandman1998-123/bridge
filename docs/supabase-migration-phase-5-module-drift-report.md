# Supabase Migration Phase 5 Module Drift Report

Generated: 2026-07-15T05:56:11.244Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 5 is read-only. It classifies the remaining migration ledger drift by module and performs catalog-only object checks for local-only migrations. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | MODULE_AUDIT_READY |
| Local migration files | 365 |
| Duplicate local timestamps | 0 |
| Remote ledger fetched | yes |
| Matched rows | 360 |
| Split local/remote versions | 0 |
| Pure local-only rows | 5 |
| Pure remote-only rows | 0 |
| Extracted objects checked | 54 |

## Module Summary

| Module | Pure Local-Only | Split Rows | All Live | Partial Live | None Live | No Static Objects | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bond_finance | 2 | 0 | 0 | 0 | 2 | 0 | Needs object-level review; do not repair as a batch yet. |
| other | 2 | 0 | 0 | 1 | 1 | 0 | Needs object-level review; do not repair as a batch yet. |
| workspace_platform | 1 | 0 | 0 | 0 | 1 | 0 | Needs object-level review; do not repair as a batch yet. |

## Split Ledger Rows

No split local/remote versions detected.

## Reviewed Repair Candidates

No pure local-only migration is ready for repair from static object evidence alone.

## Needs Object Review

| Version | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- |
| 202607050008 | bond_finance | 202607050008_commission_levels_targets_rules.sql | none_live | 0/26 |
| 202607080001 | bond_finance | 202607080001_commission_targets_period_metric_phase1.sql | none_live | 0/6 |
| 202607140016 | other | 202607140016_sa_legal_instrument_family_governance.sql | partial_live | 2/9 |
| 202607140017 | other | 202607140017_sa_legal_deal_facts_phase2.sql | none_live | 0/4 |
| 202606220002 | workspace_platform | 202606220002_admin_mobile_dashboard_events.sql | none_live | 0/9 |

## Local-Only Drift Detail

| Version | Bucket | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- | --- |
| 202607050008 | pure_local_only | bond_finance | 202607050008_commission_levels_targets_rules.sql | none_live | 0/26 |
| 202607080001 | pure_local_only | bond_finance | 202607080001_commission_targets_period_metric_phase1.sql | none_live | 0/6 |
| 202607140016 | pure_local_only | other | 202607140016_sa_legal_instrument_family_governance.sql | partial_live | 2/9 |
| 202607140017 | pure_local_only | other | 202607140017_sa_legal_deal_facts_phase2.sql | none_live | 0/4 |
| 202606220002 | pure_local_only | workspace_platform | 202606220002_admin_mobile_dashboard_events.sql | none_live | 0/9 |

## Object Extraction

| Metric | Value |
| --- | --- |
| Static objects extracted | 54 |
| Catalog rows returned | 54 |
| Object check command | ok |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /var/folders/r_/zbzvf7r10897f7jqjfy4sfvh0000gn/T/supabase-phase5-object-checks-25446.sql --output-format json | ok | Initialising login role... |

## Next Step

Use this module matrix to choose the next small repair batch. Split ledger rows should be investigated before broad migration operations; pure local-only rows need module smoke evidence before any further `migration repair`.

