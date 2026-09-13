# Supabase Migration Phase 5 Module Drift Report

Generated: 2026-09-13T07:45:31.326Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 5 is read-only. It classifies the remaining migration ledger drift by module and performs catalog-only object checks for local-only migrations. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | MODULE_AUDIT_READY |
| Local migration files | 1100 |
| Duplicate local timestamps | 0 |
| Remote ledger fetched | yes |
| Matched rows | 1094 |
| Split local/remote versions | 0 |
| Reviewed split baseline | 0 |
| Unreviewed split versions | 0 |
| Pure local-only rows | 6 |
| Pure remote-only rows | 0 |
| Application manifest rows | 6 |
| Extracted objects checked | 39 |

## Module Summary

| Module | Pure Local-Only | Split Rows | Unreviewed Split | All Live | Partial Live | None Live | No Static Objects | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| other | 6 | 0 | 0 | 0 | 0 | 6 | 0 | Needs object-level review; do not repair as a batch yet. |

## Split Ledger Rows

No split local/remote versions detected.

## Reviewed Repair Candidates

No pure local-only migration is ready for repair from static object evidence alone.

## Needs Object Review

| Version | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- |
| 20260913072126 | other | 20260913072126_revo_shared_inbox_foundation.sql | none_live | 0/19 |
| 20260913073516 | other | 20260913073516_website_dashboard_analytics_phase2.sql | none_live | 0/1 |
| 20260913073607 | other | 20260913073607_revo_shared_inbox_operations.sql | none_live | 0/10 |
| 20260913073857 | other | 20260913073857_website_first_party_analytics_phase3.sql | none_live | 0/6 |
| 20260913074251 | other | 20260913074251_website_domain_management_phase4.sql | none_live | 0/2 |
| 20260913074529 | other | 20260913074529_revo_shared_inbox_channel_setup.sql | none_live | 0/1 |

## Application Manifest

This is a conservative staging manifest, not authorization to apply SQL. `Depends On` expresses ordering within the inferred deployment stream; every stream still requires a live prerequisite check.

| Action | Count |
| --- | --- |
| apply_original_after_dependency_check | 6 |

| Version | Stream | Depends On | Module | File | Evidence | Action | Required Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 20260913072126 | other | stream preflight | other | 20260913072126_revo_shared_inbox_foundation.sql | none_live (0/19) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913073516 | other | 20260913072126 | other | 20260913073516_website_dashboard_analytics_phase2.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913073607 | other | 20260913073516 | other | 20260913073607_revo_shared_inbox_operations.sql | none_live (0/10) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913073857 | other | 20260913073607 | other | 20260913073857_website_first_party_analytics_phase3.sql | none_live (0/6) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913074251 | other | 20260913073857 | other | 20260913074251_website_domain_management_phase4.sql | none_live (0/2) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260913074529 | other | 20260913074251 | other | 20260913074529_revo_shared_inbox_channel_setup.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |

## Local-Only Drift Detail

| Version | Bucket | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- | --- |
| 20260913072126 | pure_local_only | other | 20260913072126_revo_shared_inbox_foundation.sql | none_live | 0/19 |
| 20260913073516 | pure_local_only | other | 20260913073516_website_dashboard_analytics_phase2.sql | none_live | 0/1 |
| 20260913073607 | pure_local_only | other | 20260913073607_revo_shared_inbox_operations.sql | none_live | 0/10 |
| 20260913073857 | pure_local_only | other | 20260913073857_website_first_party_analytics_phase3.sql | none_live | 0/6 |
| 20260913074251 | pure_local_only | other | 20260913074251_website_domain_management_phase4.sql | none_live | 0/2 |
| 20260913074529 | pure_local_only | other | 20260913074529_revo_shared_inbox_channel_setup.sql | none_live | 0/1 |

## Object Extraction

| Metric | Value |
| --- | --- |
| Static objects extracted | 39 |
| Catalog rows returned | 39 |
| Object check command | ok |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /var/folders/r_/zbzvf7r10897f7jqjfy4sfvh0000gn/T/supabase-phase5-object-checks-9575.sql --output-format json | ok | Initialising login role... |

## Next Step

Use this module matrix to choose the next small repair batch. Any unreviewed split ledger row must be investigated first; reviewed baseline rows remain excluded from repair batches. Pure local-only rows need module smoke evidence before any `migration repair`.

