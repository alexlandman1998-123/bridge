# Supabase Migration Phase 1 Reconciliation Report

Generated: 2026-09-06T15:59:36.933Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 1 is read-only. This report is built from the local migration directory, `supabase migration list --linked`, and catalog-only SQL checks. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Executive Summary

| Metric | Value |
| --- | --- |
| Local migration files | 989 |
| Duplicate local timestamps | 0 |
| Remote ledger rows fetched | 990 |
| Remote matched rows | 895 |
| Remote-only rows | 1 |
| Local-only rows in CLI comparison | 94 |
| Split local/remote versions | 1 |
| Live onboarding object checks ready | 17/17 |

## Onboarding Critical Matrix

| Version | Migration | Local file | Remote ledger | Live objects | Next action |
| --- | --- | --- | --- | --- | --- |
| 202605240010 | atomic workspace onboarding | 1 file | recorded applied | ready | No Phase 2 object patch needed. |
| 202606040001 | role-contract onboarding wrapper | 1 file | recorded applied | ready | No Phase 2 object patch needed. |
| 202606170002 | principal claim invite RPC | 1 file | recorded applied | ready | No Phase 2 object patch needed. |
| 202606170003 | principal claim completion RPC | 1 file | recorded applied | ready | No Phase 2 object patch needed. |
| 202606190001 | email-claim onboarding repair | 1 file | recorded applied | ready | No Phase 2 object patch needed. |
| 202607020002 | principal-claim invite RLS hardening | 1 file | recorded applied | ready | No Phase 2 object patch needed. |
| 202607120002 | branch-scope onboarding fix | 1 file | recorded applied | ready | No Phase 2 object patch needed. |

## Phase 2 Queue

No onboarding-critical live-object patch is currently indicated by the Phase 1 checks.

## Phase 3 Ledger Repair Candidates

No onboarding-critical ledger repair candidate was identified from the current checks.

## Duplicate Local Migration Timestamps

No duplicate local migration timestamps detected.

## Remote Ledger Comparison

| Bucket | Count |
| --- | --- |
| matched | 895 |
| remote-only | 1 |
| local-only | 94 |
| divergent | 0 |
| split versions | 1 |

### Split Versions

- 202609030001

### Remote-Only Rows

- 202609030001

### Local-Only Rows

- 20260817174624
- 20260818203652
- 202608200001
- 202608200002
- 20260820160621
- 20260820174624
- 20260820192038
- 20260820192857
- 20260820193436
- 202608230001
- 202608230002
- 202608240001
- 20260824084233
- 20260824091732
- 20260824092531
- 202608250001
- 20260827081713
- 20260827083108
- 20260827091439
- 20260828203724
- 202608290001
- 202608290002
- 20260829103738
- 20260829105514
- 20260829111644
- 20260829112135
- 20260829112530
- 20260829195657
- 20260829204153
- 20260830125035
- 20260830160810
- 20260831071807
- 20260831072652
- 20260831120000
- 20260831131538
- 20260831140736
- 20260831150740
- 20260831153322
- 20260831190341
- 20260901075131
- 20260901110612
- 20260901140943
- 20260901143358
- 20260901145225
- 20260901165511
- 20260901170254
- 20260901170909
- 20260901174924
- 20260902095249
- 20260902105303
- 202609030001
- 20260903094624
- 20260903094957
- 20260903122031
- 20260903130012
- 20260905090353
- 20260905091122
- 20260905095152
- 20260905100612
- 20260905100908
- 20260905101301
- 20260905101931
- 20260905102430
- 20260905102813
- 20260905102934
- 20260905120250
- 20260905125639
- 20260905141005
- 20260905141007
- 20260905141008
- 20260905141009
- 20260905141010
- 20260905141011
- 20260905141012
- 20260905141013
- 20260905141014
- 20260905141015
- 20260905141016
- 20260905141017
- 20260905141018
- 20260905141019
- 20260905141020
- 20260905141021
- 20260905150420
- 20260906063435
- 20260906065759
- 20260906070515
- 20260906070938
- 20260906071644
- 20260906123000
- 20260906130000
- 20260906133000
- 20260906134500
- 20260906140000

## Live Onboarding Object Checks

| Check | Type | Ready | Live exists | Expected |
| --- | --- | --- | --- | --- |
| invites_principal_claim_type_constraint | constraint | yes | yes | invites_invite_type_check |
| workspace_preference_principal_claim_source_constraint | constraint | yes | yes | user_workspace_preferences_source_check |
| principal_claim_completion_rpc | function | yes | yes | bridge_complete_principal_claim_onboarding(payload jsonb) |
| principal_claim_invite_rpc | function | yes | yes | bridge_create_principal_claim_invite(payload jsonb) |
| principal_claim_sync_trigger_function | function | yes | yes | bridge_sync_principal_claim_membership() |
| workspace_onboarding_legacy_rpc | function | yes | yes | bridge_complete_workspace_onboarding_legacy_20260524(payload jsonb) |
| workspace_onboarding_rpc | function | yes | yes | bridge_complete_workspace_onboarding(payload jsonb) |
| workspace_onboarding_branch_scope_fix | function_body | yes | yes | bridge_complete_workspace_onboarding handles null branch_scope |
| workspace_repair_email_claim_function | function_body | yes | yes | bridge_repair_workspace_onboarding includes email-claim repair body |
| invites_insert_member_fallback_policy | policy | yes | yes | invites_insert_active_workspace_member_fallback |
| invites_insert_workspace_admin_policy | policy | yes | yes | invites_insert_workspace_admin |
| organisation_users_principal_claim_select_policy | policy | yes | yes | organisation_users_agency_select |
| organisations_principal_claim_select_policy | policy | yes | yes | organisations_agency_select |
| invites_table | table | yes | yes | invites exists |
| onboarding_states_table | table | yes | yes | onboarding_states exists |
| workspace_onboarding_completions_table | table | yes | yes | workspace_onboarding_completions exists |
| principal_claim_sync_trigger | trigger | yes | yes | trg_bridge_sync_principal_claim_membership |

## Command Evidence

| Command | Status | Parsed rows | Notes |
| --- | --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | 990 | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /Users/alexanderlandman/the-it-guy/sql/supabase-phase1-live-object-checks.sql --output-format json | ok | 17 | Initialising login role... |

## Live Check SQL Fingerprint

- File: `sql/supabase-phase1-live-object-checks.sql`
- Bytes: 5673

## 2026-09-08 Production Re-baseline

This re-baseline supersedes the counts above for the active recovery work. It
uses the linked production project and is deliberately read-only.

| Measure | Result |
| --- | ---: |
| Total unmatched local/remote ledger rows | 99 |
| Local migration files not recorded as applied in production | 82 |
| Current Deal Setup → attorney handoff migration | applied (`20260908105346`) |

### Critical transaction and attorney contract checks

| Contract | Production status | History status | Classification |
| --- | --- | --- | --- |
| `transaction_participants.ownership_percentage` and `signing_required` | present | `20260907193000` not recorded | Historical ledger candidate; verify full constraint before repair. |
| `transactions.current_detailed_stage` | present | `20260907194208` not recorded | Historical ledger candidate; verify Data API visibility before repair. |
| `transaction_refresh_signals` table | present | earlier history is incomplete | Object exists; refresh trigger still required. |
| `bridge_emit_attorney_workflow_refresh_signal()` | absent | `20260907183523` not recorded | Required production change; do not ledger-repair. |
| `bridge_reconcile_attorney_lane_progress_with_matter_plan()` | present | `20260908064347` not recorded | Historical ledger candidate; verify grants and body before repair. |
| `transaction_sync_action_catalog` | present | `20260908065905` not recorded | Historical ledger candidate; verify required action row before repair. |

### Release-train classification

| Train | Handling decision |
| --- | --- |
| Developer / attorney / Deal Setup | Priority release train; contract-test each migration and apply only missing behavior. |
| Organisation / access controls | Separate security-reviewed wave. |
| Public websites / marketing | Separate public-surface wave; do not mix with transactions. |
| Bond and rental | Separate dependency chain with data and RLS checks. |
| Commercial, WhatsApp, analytics | Hold until their module is explicitly released. |

### Phase 1 decision

No historical migration may be blindly replayed or marked applied solely to
remove drift. A migration is eligible for ledger reconciliation only when its
full live contract (tables, columns, constraints, functions, grants, RLS, and
required reference rows) has been checked. Missing behavior is promoted as a
new idempotent corrective migration in its own release train.

## Phase 2 implementation — 2026-09-08

The following history entries were reconciled only after their live contracts
were verified:

| Version | Basis |
| --- | --- |
| `20260907193000` | Buyer-party columns, defaults, nullability, and ownership constraint match production. |
| `20260907194208` | `transactions.current_detailed_stage` exists with the expected nullable text contract. |

The missing attorney refresh behavior was not ledger-repaired. It was promoted
as a new production migration: `20260908121455_transaction_attorney_refresh_contract_repair`.
It creates the refresh function and trigger and seeds the
`ATTORNEY_WORKFLOW_PLAN_RECONCILED` catalog action idempotently. Production
verification confirmed all three objects after application.

## Phase 4 implementation — 2026-09-08

The final transaction/attorney compatibility entries were reconciled after
their live contracts were verified:

| Version | Verified live contract |
| --- | --- |
| `20260907194623` | Buyer ownership/signing fields and `units.property_title_type` are present. |
| `20260908064347` | Attorney lane reconciliation function exists, includes the active-plan guard, and grants authenticated execution. |
| `20260908065905` | `ATTORNEY_WORKFLOW_PLAN_RECONCILED` exists in the action catalog with the expected professional visibility contract. |

Website, rental, commercial, analytics, and messaging migrations remain
outside this release train and have not been replayed or ledger-repaired.
