# Main Reconciliation Divergent Migration Ledger - 2026-07-28

Branch: `codex/main-reconciliation-20260728`

This ledger resolves same-named and timestamp-colliding Supabase migrations found while reconciling outstanding branches into latest `main`.

Rule used for every decision: do not edit historical migration files that may already exist in a Supabase ledger. Keep the `main` version unless the branch version is clearly production-safe and not superseded. When useful behavior is buried in a divergent or colliding migration, add a new forward corrective migration.

## Decisions

| Area | Source branch/file | Decision | Resolution |
| --- | --- | --- | --- |
| Hot-path indexes | `codex/auth-bridge-bootstrap-timeout` `202607270001_client_portal_bootstrap_hot_path_indexes.sql` | Create corrective migration | Timestamp collided with `202607270001_lead_acknowledgement_email.sql`; promoted as `202607270009_client_portal_bootstrap_hot_path_indexes.sql`. |
| Hot-path indexes | `codex/auth-bridge-bootstrap-timeout` `202607260008_document_packet_hot_lookup_indexes.sql`, `202607270002_agency_lead_workspace_hot_path_indexes.sql` | Keep branch version | No historical conflict; promoted directly. |
| Client portal stability | Local uncommitted edit to `202607140004_client_portal_phase1_access_stability.sql` | Create corrective migration | Historical file kept intact; notification behavior promoted as `202607270010_seller_document_completion_notification.sql`. |
| Attorney lifecycle | `codex/archline-attorney-workspace` `202607220002_transaction_key_dates.sql` | Create corrective migration | Timestamp collided with main mandate delivery migration; promoted as `202607270011_attorney_transaction_key_dates.sql`. |
| Attorney lifecycle | `codex/archline-attorney-workspace` `202607220003_canonical_matter_lifecycle_stages.sql` | Create corrective migration | Timestamp collided with main signable packet migration. Promoted as `202607270012_canonical_matter_lifecycle_stages.sql`, adapted to preserve main's newer lane-focus advancement behavior from `202607230013_attorney_workflow_step_completion_advance.sql`. |
| Legal document / finance metadata | `codex/archline-attorney-workspace` `202607220004_document_metadata_cleanup.sql` | Create corrective migration | Timestamp collided with main canonical OTP signing migration; promoted as `202607270015_bond_finance_document_metadata_cleanup.sql`. |
| Legal runtime | `agent/restore-seller-onboarding-welcome`, `codex/demo-launch-wip-slice`, `codex/produktive-agent-provisioning`, `codex/storage-policy-token-proof`, `codex/transaction-spine-release-contained`, `codex/wip-shared-worktree-20260723` variants of `202607220004_canonical_otp_signing_phase2.sql` | Keep main version | Branch bodies are stale relative to later corrective migrations already on main, especially `202607250002_corrective_canonical_otp_signing_phase2.sql`. |
| Legal runtime | Same branches' variants of `202607220006_phase3_visual_signature_evidence.sql` | Keep main version | Branch bodies are stale relative to `202607250003_corrective_visual_signature_evidence.sql`. |
| Legal runtime | Same branches' variants of `202607220013_bond_application_consent_and_finance_document_audit.sql` | Keep main version | No production-safe reason to replace the main historical file; later corrective/document-pilot migrations carry forward reviewed behavior. |
| Legal release epoch | Same branches' variants of `202607230005_phase6_successor_release_epoch_integrity.sql` | Keep main version | Main version is the canonical successor release epoch body; branch variants are not replacing a historical migration. |
| Bond outcome RLS | `codex/wip-shared-worktree-20260723` edit to `202607220015_bond_bank_outcomes_and_registration_handoff.sql` | Keep main version | The useful branch change already exists as forward migration `202607230011_bond_bank_outcome_originator_rls_repair.sql`. |
| Transaction progress scheduler | `codex/wip-shared-worktree-20260723` `202607230010_transaction_progress_scheduler_proof_phase8.sql` | Keep existing main/reconciliation version | File already exists on the reconciliation branch; no divergent historical edit required. |
| Legal pilot terminal state | `codex/mvp-pilot-readiness` `202607210002_final_mandate_completion_terminal_state.sql` | Create corrective migration | Useful terminal-stamping behavior promoted as `202607270013_final_mandate_completion_terminal_state.sql`; superseded function body for `bridge_get_final_completion_status_f5` was not copied because main has newer `202607260001_corrective_final_completion_status_truth.sql`. |
| Legal pilot template approval metadata | `codex/mvp-pilot-readiness` `202607210003_allow_b3_approval_metadata_on_published_templates.sql` | Keep main version | Superseded by `202607250004_corrective_legal_runtime_metadata_immutability.sql`; no replacement. |
| Legal pilot native PDF certification | `codex/mvp-pilot-readiness` `202607210004_certify_native_structured_legal_pdf.sql` | Create corrective migration | Useful certification RPC promoted as `202607270014_certify_native_structured_legal_pdf.sql`. |
| Launch packet authority | `codex/mvp-pilot-readiness` `202607200012_phase5_launch_packet_authority.sql` | Keep main version | Timestamp collides with `202607200012_canonical_partner_assignment_ids.sql`; packet authority is already covered by current H2 least-privilege and later document generator policy migrations. |
| Document generator timestamp collisions | `codex/arch9-mvp-release` `202607180025_document_generator_recovery_rehearsal_g4.sql`, `202607180026_document_generator_least_privilege_h2.sql`, `202607180027_document_generator_public_signer_surface_h4.sql`, `202607180028_document_generator_concurrency_i1.sql`, `202607180032_document_generator_backpressure_i3.sql` | Keep main version | These collide with attorney accounting/calendar timestamps and are already represented on main with non-colliding forward migrations `202607180048` through `202607180052`. |
| MVP/baseline historical edits | `codex/mvp-pilot-readiness`, `codex/db-phase0-reconciliation`, `codex/archive-phase39-baseline-20260723` exact-path divergences across May-July foundation migrations | Keep main version | These branches are stale baseline/reconciliation branches. They modify historical files already superseded by main and are not production-safe wholesale replacements. |
| Older access/module timestamp collisions | `codex-document-access-permissions-phase7`, `codex-seller-onboarding-mobile-phases`, `codex/fix-seller-portal-token` branch-only migrations with timestamps already used on main | Keep main version | These remain candidates only for future selective review as fresh forward migrations; none were blindly promoted in this pass. |

## Current Forward Migrations Added By This Reconciliation

- `202607260008_document_packet_hot_lookup_indexes.sql`
- `202607270002_agency_lead_workspace_hot_path_indexes.sql`
- `202607270009_client_portal_bootstrap_hot_path_indexes.sql`
- `202607270010_seller_document_completion_notification.sql`
- `202607270011_attorney_transaction_key_dates.sql`
- `202607270012_canonical_matter_lifecycle_stages.sql`
- `202607270013_final_mandate_completion_terminal_state.sql`
- `202607270014_certify_native_structured_legal_pdf.sql`
- `202607270015_bond_finance_document_metadata_cleanup.sql`

## Verification

- `npm run supabase:phase0` reported no duplicate local migration timestamps after each promoted batch.
- `git diff --check` passed after each promoted batch.
- Focused seller, agency lead, attorney workflow, and legal document tests passed during the relevant batches.
- `npm run build` passed after the attorney lifecycle and legal document pilot batches, with only the existing `%VITE_DOCUMENT_TITLE%` warning.

## Remaining Rule For Future Branches

Do not replace any same-named migration in `supabase/migrations`. If a remaining stale branch contains useful SQL, extract the behavior into a fresh, reviewed forward migration with a new timestamp and run the Phase 0 guard plus focused app tests.
