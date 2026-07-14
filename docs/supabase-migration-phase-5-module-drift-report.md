# Supabase Migration Phase 5 Module Drift Report

Generated: 2026-07-14T21:42:24.483Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 5 is read-only. It classifies the remaining migration ledger drift by module and performs catalog-only object checks for local-only migrations. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | MODULE_AUDIT_READY |
| Local migration files | 362 |
| Duplicate local timestamps | 0 |
| Remote ledger fetched | yes |
| Matched rows | 343 |
| Split local/remote versions | 0 |
| Pure local-only rows | 19 |
| Pure remote-only rows | 0 |
| Extracted objects checked | 149 |

## Module Summary

| Module | Pure Local-Only | Split Rows | All Live | Partial Live | None Live | No Static Objects | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| developer_referral | 8 | 0 | 0 | 1 | 7 | 0 | Needs object-level review; do not repair as a batch yet. |
| notification_automation | 6 | 0 | 0 | 0 | 6 | 0 | Needs object-level review; do not repair as a batch yet. |
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
| 202606290016 | developer_referral | 202606290016_developer_partner_relationships_phase1.sql | none_live | 0/26 |
| 202606290017 | developer_referral | 202606290017_developer_partner_invites_phase5.sql | none_live | 0/4 |
| 202606290018 | developer_referral | 202606290018_developer_partner_defaults_phase6.sql | partial_live | 1/6 |
| 202607050002 | developer_referral | 202607050002_referral_mvp_phase1_schema.sql | none_live | 0/8 |
| 202607050003 | developer_referral | 202607050003_referral_mvp_phase3_terms_response_rpc.sql | none_live | 0/1 |
| 202607050004 | developer_referral | 202607050004_referral_mvp_phase6_external_invite_response.sql | none_live | 0/2 |
| 202607050005 | developer_referral | 202607050005_referral_mvp_phase9_activity_signals.sql | none_live | 0/2 |
| 202607080004 | developer_referral | 202607080004_developer_partner_invite_bind_partner_org.sql | none_live | 0/1 |
| 202607050009 | notification_automation | 202607050009_notification_automation_foundation.sql | none_live | 0/18 |
| 202607050010 | notification_automation | 202607050010_notification_automation_phase2_acceptance_events.sql | none_live | 0/12 |
| 202607060001 | notification_automation | 202607060001_notification_automation_phase3_reminder_queue.sql | none_live | 0/7 |
| 202607060002 | notification_automation | 202607060002_notification_automation_phase4_reminder_dispatch.sql | none_live | 0/5 |
| 202607060003 | notification_automation | 202607060003_notification_automation_phase5_observability.sql | none_live | 0/1 |
| 202607060004 | notification_automation | 202607060004_notification_automation_phase6_premium_controls.sql | none_live | 0/2 |
| 202607140016 | other | 202607140016_sa_legal_instrument_family_governance.sql | partial_live | 2/9 |
| 202607140017 | other | 202607140017_sa_legal_deal_facts_phase2.sql | none_live | 0/4 |
| 202606220002 | workspace_platform | 202606220002_admin_mobile_dashboard_events.sql | none_live | 0/9 |

## Local-Only Drift Detail

| Version | Bucket | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- | --- |
| 202607050008 | pure_local_only | bond_finance | 202607050008_commission_levels_targets_rules.sql | none_live | 0/26 |
| 202607080001 | pure_local_only | bond_finance | 202607080001_commission_targets_period_metric_phase1.sql | none_live | 0/6 |
| 202606290016 | pure_local_only | developer_referral | 202606290016_developer_partner_relationships_phase1.sql | none_live | 0/26 |
| 202606290017 | pure_local_only | developer_referral | 202606290017_developer_partner_invites_phase5.sql | none_live | 0/4 |
| 202606290018 | pure_local_only | developer_referral | 202606290018_developer_partner_defaults_phase6.sql | partial_live | 1/6 |
| 202607050002 | pure_local_only | developer_referral | 202607050002_referral_mvp_phase1_schema.sql | none_live | 0/8 |
| 202607050003 | pure_local_only | developer_referral | 202607050003_referral_mvp_phase3_terms_response_rpc.sql | none_live | 0/1 |
| 202607050004 | pure_local_only | developer_referral | 202607050004_referral_mvp_phase6_external_invite_response.sql | none_live | 0/2 |
| 202607050005 | pure_local_only | developer_referral | 202607050005_referral_mvp_phase9_activity_signals.sql | none_live | 0/2 |
| 202607080004 | pure_local_only | developer_referral | 202607080004_developer_partner_invite_bind_partner_org.sql | none_live | 0/1 |
| 202607050009 | pure_local_only | notification_automation | 202607050009_notification_automation_foundation.sql | none_live | 0/18 |
| 202607050010 | pure_local_only | notification_automation | 202607050010_notification_automation_phase2_acceptance_events.sql | none_live | 0/12 |
| 202607060001 | pure_local_only | notification_automation | 202607060001_notification_automation_phase3_reminder_queue.sql | none_live | 0/7 |
| 202607060002 | pure_local_only | notification_automation | 202607060002_notification_automation_phase4_reminder_dispatch.sql | none_live | 0/5 |
| 202607060003 | pure_local_only | notification_automation | 202607060003_notification_automation_phase5_observability.sql | none_live | 0/1 |
| 202607060004 | pure_local_only | notification_automation | 202607060004_notification_automation_phase6_premium_controls.sql | none_live | 0/2 |
| 202607140016 | pure_local_only | other | 202607140016_sa_legal_instrument_family_governance.sql | partial_live | 2/9 |
| 202607140017 | pure_local_only | other | 202607140017_sa_legal_deal_facts_phase2.sql | none_live | 0/4 |
| 202606220002 | pure_local_only | workspace_platform | 202606220002_admin_mobile_dashboard_events.sql | none_live | 0/9 |

## Object Extraction

| Metric | Value |
| --- | --- |
| Static objects extracted | 149 |
| Catalog rows returned | 149 |
| Object check command | ok |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /var/folders/r_/zbzvf7r10897f7jqjfy4sfvh0000gn/T/supabase-phase5-object-checks-98973.sql --output-format json | ok | Initialising login role... |

## Next Step

Use this module matrix to choose the next small repair batch. Split ledger rows should be investigated before broad migration operations; pure local-only rows need module smoke evidence before any further `migration repair`.

