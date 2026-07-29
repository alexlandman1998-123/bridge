# Supabase Phase 17 Remaining Drift Triage

Generated: 2026-07-29T19:14:00Z

## Decision

Status: `REMAINING_DRIFT_TRIAGED`

The old 128-blocker Supabase drift packet is no longer the active blocker set. Live verification now shows a smaller and clearer backlog:

- Pure local-only migration versions: 32
- Pure remote-only migration versions: 0
- Divergent local/remote migration versions: 0
- Historical split versions: 17, all reviewed
- Duplicate local migration timestamps: 0
- Production recovery evidence: locked
- Public agency intake versions `202607290002`, `202607290003`, and `202607290004`: matched live

The remaining blocker is not agency public intake. It is that 32 newer local migrations have no production promotion plan in `docs/supabase-push-phase-5-production-promotion.json`.

## Verification Commands

```sh
node scripts/supabase-phase0-guard.mjs --json
node scripts/supabase-phase8-closeout.mjs --verify-live --json
node scripts/supabase-resolve-ledger-drift.mjs --verify-live --json
```

## Current Gate Result

`scripts/supabase-phase8-closeout.mjs --verify-live --json` still returns `CLOSEOUT_BLOCKED`.

The blocker reason is now specific:

```text
32 pure local-only migrations are missing a production promotion plan.
```

## Remaining Local-Only Migrations

| Version | File | Triage Bucket |
| --- | --- | --- |
| `202607260008` | `202607260008_document_packet_hot_lookup_indexes.sql` | Performance/index promotion plan |
| `202607270002` | `202607270002_agency_lead_workspace_hot_path_indexes.sql` | Performance/index promotion plan |
| `202607270009` | `202607270009_client_portal_bootstrap_hot_path_indexes.sql` | Performance/index promotion plan |
| `202607270010` | `202607270010_seller_document_completion_notification.sql` | Legal/document workflow promotion plan |
| `202607270011` | `202607270011_attorney_transaction_key_dates.sql` | Attorney/legal workflow promotion plan |
| `202607270012` | `202607270012_canonical_matter_lifecycle_stages.sql` | Legal/document workflow promotion plan |
| `202607270013` | `202607270013_final_mandate_completion_terminal_state.sql` | Legal/document workflow promotion plan |
| `202607270014` | `202607270014_certify_native_structured_legal_pdf.sql` | Legal/document workflow promotion plan |
| `202607270015` | `202607270015_bond_finance_document_metadata_cleanup.sql` | Bond/document workflow promotion plan |
| `202607280002` | `202607280002_email_notification_branding_readiness.sql` | Email/notification promotion plan |
| `202607280003` | `202607280003_guided_bond_application_phase5_submissions.sql` | Guided bond/originator promotion plan |
| `202607280004` | `202607280004_guided_bond_application_phase6_participants.sql` | Guided bond/originator promotion plan |
| `202607280005` | `202607280005_guided_bond_application_phase7_sureties_revisions.sql` | Guided bond/originator promotion plan |
| `202607280006` | `202607280006_guided_bond_application_phase8_external_exports.sql` | Guided bond/originator promotion plan |
| `202607280007` | `202607280007_guided_bond_application_phase8a_originator_intake.sql` | Guided bond/originator promotion plan |
| `202607280008` | `202607280008_guided_bond_application_phase8b_originator_document_requests.sql` | Guided bond/originator promotion plan |
| `202607280009` | `202607280009_guided_bond_application_phase8c_originator_progress_tracking.sql` | Guided bond/originator promotion plan |
| `202607280010` | `202607280010_guided_bond_application_phase8d_originator_offers_grants.sql` | Guided bond/originator promotion plan |
| `202607280011` | `202607280011_guided_bond_application_phase8e_buyer_offer_grant_experience.sql` | Guided bond/originator promotion plan |
| `202607280012` | `202607280012_guided_bond_application_phase8f_agent_progress_view.sql` | Guided bond/originator promotion plan |
| `202607280013` | `202607280013_guided_bond_application_phase8g_attorney_handoff.sql` | Guided bond/originator promotion plan |
| `202607280014` | `202607280014_guided_bond_application_phase8h_recipient_specific_formats.sql` | Guided bond/originator promotion plan |
| `202607280015` | `202607280015_guided_bond_application_phase8i_governance_reporting.sql` | Guided bond/originator promotion plan |
| `202607280016` | `202607280016_originator_rollout_phase_r1_internal_readiness.sql` | Originator rollout promotion plan |
| `202607280017` | `202607280017_originator_rollout_phase_r2_workspace_mvp.sql` | Originator rollout promotion plan |
| `202607280018` | `202607280018_originator_rollout_phase_r3_document_requests.sql` | Originator rollout promotion plan |
| `202607280019` | `202607280019_originator_rollout_phase_r4_progress_tracking.sql` | Originator rollout promotion plan |
| `202607280020` | `202607280020_originator_rollout_phase_r5_offers_grants_capture.sql` | Originator rollout promotion plan |
| `202607280021` | `202607280021_originator_rollout_phase_r6_one_originator_pilot.sql` | Originator rollout promotion plan |
| `202607280022` | `202607280022_originator_rollout_phase_r7_operational_hardening.sql` | Originator rollout promotion plan |
| `202607280023` | `202607280023_originator_rollout_phase_r8_multi_originator_rollout.sql` | Originator rollout promotion plan |
| `202607280024` | `202607280024_originator_rollout_phase_r9_optional_formal_integrations.sql` | Originator rollout promotion plan |

## Next Action

Create a Phase 18 promotion-plan packet for the 32 local-only migrations. Each version needs one of:

- add to the production promotion manifest with staging evidence, catalog checks, behavior checks, rollback/no-residue evidence, and approval;
- mark as superseded by a corrective migration with reviewed clearance; or
- explicitly quarantine as local-only/non-production work with an accepted closeout decision.

Until that packet exists, keep the Phase 0 broad-push guard active and avoid `supabase db push`, `supabase db reset`, and broad `supabase migration repair`.
