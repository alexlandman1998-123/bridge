# Migration Reconciliation Pass

Date: 2026-08-01

## Scope

This pass reconciles runnable Supabase migration files across:

- `origin/main`
- `origin/ops/production-evidence-202607310006`
- current staging and production evidence packets
- triaged open source branches
- fresh integration branches created from `origin/main`

It does not apply SQL, repair migration ledgers, modify production, or merge branch code.

## Baseline Counts

| Item | Count |
| --- | ---: |
| Runnable migrations on `origin/main` | 618 |
| Current production-promotion rows | 36 |
| Complete production-promotion rows | 33 |
| Pending production-promotion rows | 3 |
| Branch migration diffs scanned | 342 |

The three production-promotion rows that were pending at the start of this pass are now complete:

| Version | Migration | Staging | Production |
| --- | --- | --- | --- |
| `202608010001` | `202608010001_seller_onboarding_progress_fast_return.sql` | Complete | Complete |
| `202608010002` | `202608010002_fix_legal_document_agent_context_lead_lookup.sql` | Complete | Complete |
| `202608010003` | `202608010003_legal_document_job_stage_timings_phase7.sql` | Complete | Complete |

## Classification Summary

| Classification | Count | Decision |
| --- | ---: | --- |
| Fresh forward candidates | 4 | Recreate as new forward migrations after the three pending `20260801` rows are promoted. |
| Already on `main` | 101 | No migration port required; review branch code only if still useful. |
| Version collision or superseded | 39 | Do not port as-is; create a new timestamped migration only if the intent is still needed. |
| Historical migration edits | 55 | Do not edit historical migrations; use corrective forward migrations only. |
| Historical deletes/renames/drift | 117 | Do not replay into current `main`. |
| Archive/reference-only branch migrations | 26 | Treat as historical source material only. |

## Fresh Forward Candidates

These are the only branch migration intents that should move forward as new migrations, subject to feature review.

| Source Branch | Branch Migration | Decision |
| --- | --- | --- |
| `codex/reminder-health-controls` | `202607310007_notification_automation_reminder_health_controls.sql` | Port as a new forward migration. Recommended next name: `202608010004_notification_automation_reminder_health_controls.sql`. |
| `codex/recover-buyer-onboarding-projection-20260801` | `202607310008_buyer_onboarding_projection_recovery_events.sql` | Port as a new forward migration. Recommended next name: `202608010005_buyer_onboarding_projection_recovery_events.sql`. |
| `origin/agent/legal-document-notification-sequence-phase1` | `202607310004_dashboard_developer_aggregate_rpc.sql` | Port only if still needed. Recommended next name: `202608010006_dashboard_developer_aggregate_rpc.sql`. |
| `origin/agent/legal-document-notification-sequence-phase1` | `202607310005_dashboard_developer_metric_rollups.sql` | Port only if still needed. Recommended next name: `202608010007_dashboard_developer_metric_rollups.sql`. |

`202608010001`, `202608010002`, and `202608010003` have now been promoted first, so the next fresh-forward migration version should start at `202608010004`.

## Superseded Or Colliding Branch Migrations

| Source Branch | Branch Migration | Current Main / Decision |
| --- | --- | --- |
| `origin/agent/legal-document-notification-sequence-phase1` | `202607310007_seller_onboarding_progress_fast_return.sql` | Superseded by `202608010001_seller_onboarding_progress_fast_return.sql` on `origin/main`. Do not port. |
| `codex/archline-attorney-workspace` | `202607220002_transaction_key_dates.sql` | Version collides with `202607220002_authoritative_mandate_signing_delivery_phase0.sql` on `origin/main`. Fresh migration required if still needed. |
| `codex/archline-attorney-workspace` | `202607220003_canonical_matter_lifecycle_stages.sql` | Version collides with `202607220003_signable_packet_sent_phase1.sql` on `origin/main`. Fresh migration required if still needed. |
| `codex/archline-attorney-workspace` | `202607220004_document_metadata_cleanup.sql` | Version collides with `202607220004_canonical_otp_signing_phase2.sql` on `origin/main`. Fresh migration required if still needed. |
| `codex/auth-bridge-bootstrap-timeout` | `202607270001_client_portal_bootstrap_hot_path_indexes.sql` | Version collides with `202607270001_lead_acknowledgement_email.sql` on `origin/main`. Fresh migration required if still needed. |
| `codex/arch9-mvp-release` | `202607190001_mvp_seller_acceptance_canonical_creation_phase1.sql` | Version collides with `202607190001_transaction_workflow_cross_module_visibility.sql` on `origin/main`. Treat as old release material. |
| `codex-document-access-permissions-phase7` | `202607090003_transaction_network_metrics_status_compat.sql` | Version collides with `202607090003_attorney_incoming_acceptance_metadata.sql` on `origin/main`. Treat as old release material. |
| `codex-document-access-permissions-phase7` | `202607090004_assignment_queue_branch_scope_compat.sql` | Version collides with `202607090004_attorney_incoming_decline_metadata.sql` on `origin/main`. Treat as old release material. |
| `codex-document-access-permissions-phase7` | `202607090007_security_audit_event_rpc.sql` | Version collides with `202607090007_private_listing_mandate_status_alignment.sql` on `origin/main`. Treat as old release material. |
| `codex-document-access-permissions-phase7` | `202607120001_invite_operational_hardening.sql` | Version collides with `202607120001_agency_default_legal_template_starters.sql` on `origin/main`. Treat as old release material. |
| `codex-document-access-permissions-phase7` | `202607120002_transaction_attorney_matter_references.sql` | Version collides with `202607120002_fix_workspace_onboarding_branch_scope.sql` on `origin/main`. Treat as old release material. |

## Already Covered On Main

The following active-branch migration intents already exist on `origin/main` and should not be re-ported:

| Source Branch | Covered Migrations |
| --- | --- |
| `codex/agency-public-intake-phase8` | `202607290002_agency_public_intake_links_phase1.sql`, `202607290003_agency_public_intake_submissions_phase2.sql`, `202607290004_agency_public_intake_phase8_automation.sql` |
| `codex/simple-connected-attorney-dropdown` | `20260719201000_mvp_atomic_transaction_creation_grant_hardening.sql`, `202607200002_seller_onboarding_connected_attorney_resolution.sql` |
| `codex/auth-bridge-bootstrap-timeout` | `202607260008_document_packet_hot_lookup_indexes.sql`, `202607270002_agency_lead_workspace_hot_path_indexes.sql` |
| `codex/wip-shared-worktree-20260723` | `202607230010_transaction_progress_scheduler_proof_phase8.sql` |
| `codex/arch9-mvp-release` | `202607180046_mvp_atomic_transaction_creation_phase2a.sql` |

## Historical Edits And Drift

These categories are blocked from direct migration porting:

- Any `M` diff against a historical migration on `origin/main`.
- Any `D` migration diff.
- Any `R*` migration rename diff.
- Large archive/reconciliation branches with many migration rewrites.

Affected high-drift source branches:

- `codex/mvp-pilot-readiness`
- `codex/db-phase0-reconciliation`
- `codex/archive-phase39-baseline-20260723`
- `codex/fix-seller-portal-token`
- `codex/wip-arch9-migration-reconciliation-20260723`
- `codex/auth-bridge-bootstrap-timeout`

If a capability from one of these branches is still needed, rebuild it on a fresh integration branch with a new forward migration and new staging/production evidence.

## Integration Branch Actions

| Integration Branch | Migration Action |
| --- | --- |
| `codex/integrate-production-evidence-catchup-20260801` | Finish live staging and production evidence for `202608010001` through `202608010003`. |
| `codex/integrate-reminder-health-controls-20260801` | Recreate `202607310007_notification_automation_reminder_health_controls.sql` as `202608010004_notification_automation_reminder_health_controls.sql` after catch-up promotion. |
| `codex/recover-buyer-onboarding-projection-20260801` | Before merge, re-stamp `202607310008_buyer_onboarding_projection_recovery_events.sql` as a fresh forward migration, recommended `202608010005_buyer_onboarding_projection_recovery_events.sql`. |
| `codex/integrate-legal-notification-dashboard-20260801` | Review only `202607310004` and `202607310005` dashboard/developer migration intent; recreate as fresh forward migrations only if still needed. |
| `codex/integrate-agency-public-intake-20260801` | No migration port required; focus on any feature code not already on `main`. |
| `codex/integrate-connected-attorney-dropdown-20260801` | No branch migration port from existing files; rebuild any remaining behavior with a fresh corrective migration only if needed. |
| `codex/integrate-archline-attorney-workspace-20260801` | Existing branch migration versions collide; fresh migrations required if key dates, lifecycle stages, or metadata cleanup are still needed. |
| `codex/integrate-seller-mobile-portal-20260801` | Exclude timestamp renames; port UI/service behavior only unless a current ledger audit proves a fresh migration is required. |
| `codex/integrate-transaction-progress-scheduler-20260801` | No migration port required for `202607230010`; verify whether source code/evidence still matters. |

## Next Migration Gate

Do not add any new migration from an open branch to `main` until:

1. The three `202608010001` through `202608010003` rows remain complete in staging and production evidence.
2. Any branch migration selected for integration is re-stamped as a fresh forward migration when its branch timestamp is older than the current `main` head train.
3. The manifest, staging evidence, production promotion, and closeout reports are regenerated after the selected migration is added.
