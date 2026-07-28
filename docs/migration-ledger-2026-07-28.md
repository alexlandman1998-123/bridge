# Migration Ledger - 2026-07-28

Generated against `origin/main` after fetching remote refs. This ledger is for
reconciliation planning only. Do not merge migration-heavy branches directly
from this list.

## Main Inventory

- Reference branch: `origin/main`
- Migration directory: `supabase/migrations`
- Migration files already on main: 567
- First migration on main: `supabase/migrations/202605090001_attorney_firm_foundation.sql`
- Latest migration on main: `supabase/migrations/202607270008_repair_pretransaction_mandate_final_documents.sql`

The full canonical inventory is the file list currently under
`supabase/migrations` on `origin/main`.

## Local Uncommitted Migration Edits

These are local working tree edits and are not part of any branch comparison:

| File | Local diff |
| --- | ---: |
| `supabase/migrations/202607140004_client_portal_phase1_access_stability.sql` | +71 / -0 |

Treat this file as a separate pending migration review item before creating or
merging a reconciliation branch.

## Branch Summary

| Branch | Branch-only migration paths | Same-name divergent migrations | Rename-only drift |
| --- | ---: | ---: | ---: |
| `origin/codex-document-access-permissions-phase7` | 13 | 0 | 0 |
| `origin/codex/arch9-mvp-release` | 1 | 0 | 0 |
| `origin/codex/archive-phase39-baseline-20260723` | 1 | 21 | 0 |
| `origin/codex/archline-attorney-workspace` | 3 | 0 | 0 |
| `origin/codex/auth-bridge-bootstrap-timeout` | 20 | 0 | 17 |
| `origin/codex/db-phase0-reconciliation` | 24 | 29 | 1 |
| `origin/codex/fix-seller-portal-token` | 16 | 1 | 0 |
| `origin/codex/mvp-pilot-readiness` | 23 | 33 | 18 |
| `origin/codex/simple-connected-attorney-dropdown` | 0 | 2 | 0 |
| `origin/codex/wip-arch9-migration-reconciliation-20260723` | 17 | 1 | 18 |
| `origin/codex/wip-shared-worktree-20260723` | 0 | 1 | 0 |

Branches with no migration differences are omitted from this table.

## Promote-Candidate Migrations

These are the branch-only migrations from recent focused branches that should be
reviewed first. They are not automatically safe; they are simply the freshest
and most plausibly relevant migration candidates.

### `origin/codex/auth-bridge-bootstrap-timeout`

The first 17 entries below are renamed duplicates of migrations that already
exist on main with shorter timestamp prefixes. Do not promote these as new
migrations without a Supabase migration-history decision.

- `supabase/migrations/20260601000100_partner_routing_rules_phase1.sql`
- `supabase/migrations/20260603000700_lead_communication_events.sql`
- `supabase/migrations/20260603000800_lead_listing_suggestions.sql`
- `supabase/migrations/20260603000900_lead_recommendations.sql`
- `supabase/migrations/20260603001000_lead_saved_searches.sql`
- `supabase/migrations/20260603001100_communication_delivery_preferences.sql`
- `supabase/migrations/20260604000100_onboarding_role_contract_phase2.sql`
- `supabase/migrations/20260604000200_workspace_entitlements_phase4.sql`
- `supabase/migrations/20260604000400_workspace_entitlement_enforcement_phase5.sql`
- `supabase/migrations/20260604000500_workspace_billing_operations_phase6.sql`
- `supabase/migrations/20260605000100_bond_bank_relationship_profiles.sql`
- `supabase/migrations/20260608000200_commercial_listings_foundation.sql`
- `supabase/migrations/20260609001000_created_by_access_remediation.sql`
- `supabase/migrations/20260611000400_commercial_transactions_phase2.sql`
- `supabase/migrations/20260611000500_commercial_crm_foundation_phase3.sql`
- `supabase/migrations/20260611000600_commercial_supply_side_phase4.sql`
- `supabase/migrations/20260611000700_commercial_brokerage_os_phase5.sql`
- `supabase/migrations/202607260008_document_packet_hot_lookup_indexes.sql`
- `supabase/migrations/202607270001_client_portal_bootstrap_hot_path_indexes.sql`
- `supabase/migrations/202607270002_agency_lead_workspace_hot_path_indexes.sql`

Recommended action: review and likely promote only the three 20260726/20260727
hot-path index migrations, unless the Supabase remote ledger proves the 17
renamed files are needed to repair migration history.

### `origin/codex/archline-attorney-workspace`

- `supabase/migrations/202607220002_transaction_key_dates.sql`
- `supabase/migrations/202607220003_canonical_matter_lifecycle_stages.sql`
- `supabase/migrations/202607220004_document_metadata_cleanup.sql`

Recommended action: review with the attorney workspace application changes.
These are branch-only and do not collide with same-name migrations on main.

## Additional Branch-Only Migrations

These migrations exist on unmerged branches but not under the same path on
`origin/main`. Some are probably stale or superseded.

### `origin/codex-document-access-permissions-phase7`

- `supabase/migrations/202607090003_transaction_network_metrics_status_compat.sql`
- `supabase/migrations/202607090004_assignment_queue_branch_scope_compat.sql`
- `supabase/migrations/202607090007_security_audit_event_rpc.sql`
- `supabase/migrations/202607090008_workflow_readiness_schema_alignment.sql`
- `supabase/migrations/202607090009_document_request_permission_foundation.sql`
- `supabase/migrations/202607090010_partner_routing_relationship_resolution.sql`
- `supabase/migrations/202607090011_client_branding_canonical_phase1.sql`
- `supabase/migrations/202607090012_transaction_roleplayer_partner_routing_source.sql`
- `supabase/migrations/202607090013_partner_connection_allowed_attorney_bond_originator.sql`
- `supabase/migrations/202607090014_canonical_document_anon_grant_hardening.sql`
- `supabase/migrations/202607100001_principal_invites_immediate_access.sql`
- `supabase/migrations/202607120001_invite_operational_hardening.sql`
- `supabase/migrations/202607120002_transaction_attorney_matter_references.sql`

### `origin/codex/arch9-mvp-release`

- `supabase/migrations/202607190001_mvp_seller_acceptance_canonical_creation_phase1.sql`

### `origin/codex/archive-phase39-baseline-20260723`

- `supabase/migrations/202605090000_production_schema_baseline.sql`

### `origin/codex/db-phase0-reconciliation`

- `supabase/migrations/202607140016_sa_legal_instrument_family_governance.sql`
- `supabase/migrations/202607140017_sa_legal_deal_facts_phase2.sql`
- `supabase/migrations/202607150001_governed_otp_atomic_rollback.sql`
- `supabase/migrations/202607150015_attorney_three_role_persona_permissions_phase2.sql`
- `supabase/migrations/202607160001_conveyancer_productisation_p1.sql`
- `supabase/migrations/202607160002_conveyancer_productisation_p2.sql`
- `supabase/migrations/202607160003_admin_intake_lead_contract_phase1.sql`
- `supabase/migrations/202607160004_conveyancer_productisation_p4.sql`
- `supabase/migrations/202607160005_admin_intake_lead_governance_phase4.sql`
- `supabase/migrations/202607160006_conveyancer_productisation_p5.sql`
- `supabase/migrations/202607160007_admin_intake_launch_assurance_phase6.sql`
- `supabase/migrations/202607160008_conveyancer_productisation_p6.sql`
- `supabase/migrations/202607160009_admin_intake_conversion_phase7.sql`
- `supabase/migrations/202607160010_conveyancer_productisation_p7.sql`
- `supabase/migrations/202607160011_conveyancer_productisation_p8.sql`
- `supabase/migrations/20260716150001_conveyancer_h1_routing_columns.sql`
- `supabase/migrations/20260716150002_conveyancer_h1_routing_backfill.sql`
- `supabase/migrations/20260716150003_conveyancer_h1_routing_constraints.sql`
- `supabase/migrations/20260716160001_conveyancer_h2_application_runtime.sql`
- `supabase/migrations/20260716170001_conveyancer_h4_notification_runtime.sql`
- `supabase/migrations/20260716180001_conveyancer_h5_document_application.sql`
- `supabase/migrations/20260716190001_conveyancer_h6_provider_application.sql`
- `supabase/migrations/20260716200001_conveyancer_h7_provider_transport.sql`
- `supabase/migrations/20260716210001_conveyancer_h8_operational_application.sql`

### `origin/codex/fix-seller-portal-token`

- `supabase/migrations/202607170001_seller_transfer_attorney_decision_phase1.sql`
- `supabase/migrations/202607170002_attorney_assignment_management_visibility.sql`
- `supabase/migrations/202607170003_seller_transfer_attorney_operational_hardening_phase6.sql`
- `supabase/migrations/202607170004_attorney_matter_numbering_phase1_foundation.sql`
- `supabase/migrations/202607170005_attorney_matter_numbering_phase2_service.sql`
- `supabase/migrations/202607170006_attorney_matter_numbering_phase3_backfill.sql`
- `supabase/migrations/202607170007_attorney_matter_numbering_phase4_settings.sql`
- `supabase/migrations/202607170008_attorney_matter_numbering_phase6_reference_index.sql`
- `supabase/migrations/202607170009_attorney_firm_modules_phase1_foundation.sql`
- `supabase/migrations/202607170010_attorney_matter_numbering_phase7_rollout_readiness.sql`
- `supabase/migrations/202607170011_attorney_matter_numbering_phase8_launch_telemetry.sql`
- `supabase/migrations/202607170012_attorney_firm_modules_phase3_control_plane.sql`
- `supabase/migrations/202607170013_attorney_firm_modules_phase6_write_guards.sql`
- `supabase/migrations/202607170014_attorney_firm_modules_phase7_lifecycle_assurance.sql`
- `supabase/migrations/202607170015_attorney_firm_modules_phase8_launch_telemetry.sql`
- `supabase/migrations/202607170016_attorney_firm_first_allocation_phase2.sql`

### `origin/codex/mvp-pilot-readiness`

- `supabase/migrations/202605090000_production_schema_baseline.sql`
- `supabase/migrations/202606010005_transaction_canonical_document_requirement_engine.sql`
- `supabase/migrations/202606030016_bond_application_ownership_history.sql`
- `supabase/migrations/202606030017_bond_routing_rules.sql`
- `supabase/migrations/202606030018_normalize_lead_categories_s1.sql`
- `supabase/migrations/202606030019_bond_partner_management.sql`
- `supabase/migrations/202606030020_bond_partner_portal.sql`
- `supabase/migrations/202606040007_bond_application_type_classification.sql`
- `supabase/migrations/202606040008_bond_hq_command_centre.sql`
- `supabase/migrations/202606040009_bond_bank_relationship_management.sql`
- `supabase/migrations/202606040010_bond_automation_rules_engine.sql`
- `supabase/migrations/202606040011_bond_predictive_analytics.sql`
- `supabase/migrations/202606050004_bond_revenue_commercial_control_centre.sql`
- `supabase/migrations/202606080006_commercial_document_compliance_workflow.sql`
- `supabase/migrations/202606090015_add_profile_avatar_url.sql`
- `supabase/migrations/202606110009_offer_workflow_phase1_lock.sql`
- `supabase/migrations/202606110010_offer_terms_phase3.sql`
- `supabase/migrations/202606110011_seller_offer_authority_phase4.sql`
- `supabase/migrations/202606110012_transaction_conversion_phase5.sql`
- `supabase/migrations/202607200012_phase5_launch_packet_authority.sql`
- `supabase/migrations/202607210002_final_mandate_completion_terminal_state.sql`
- `supabase/migrations/202607210003_allow_b3_approval_metadata_on_published_templates.sql`
- `supabase/migrations/202607210004_certify_native_structured_legal_pdf.sql`

### `origin/codex/wip-arch9-migration-reconciliation-20260723`

- `supabase/migrations/20260601000100_partner_routing_rules_phase1.sql`
- `supabase/migrations/20260603000700_lead_communication_events.sql`
- `supabase/migrations/20260603000800_lead_listing_suggestions.sql`
- `supabase/migrations/20260603000900_lead_recommendations.sql`
- `supabase/migrations/20260603001000_lead_saved_searches.sql`
- `supabase/migrations/20260603001100_communication_delivery_preferences.sql`
- `supabase/migrations/20260604000100_onboarding_role_contract_phase2.sql`
- `supabase/migrations/20260604000200_workspace_entitlements_phase4.sql`
- `supabase/migrations/20260604000400_workspace_entitlement_enforcement_phase5.sql`
- `supabase/migrations/20260604000500_workspace_billing_operations_phase6.sql`
- `supabase/migrations/20260605000100_bond_bank_relationship_profiles.sql`
- `supabase/migrations/20260608000200_commercial_listings_foundation.sql`
- `supabase/migrations/20260609001000_created_by_access_remediation.sql`
- `supabase/migrations/20260611000400_commercial_transactions_phase2.sql`
- `supabase/migrations/20260611000500_commercial_crm_foundation_phase3.sql`
- `supabase/migrations/20260611000600_commercial_supply_side_phase4.sql`
- `supabase/migrations/20260611000700_commercial_brokerage_os_phase5.sql`

## Same-Name Divergent Migrations

These migration paths exist on both `origin/main` and at least one unmerged
branch, but the blob content differs. Do not replace main's historical migration
file during reconciliation. If the branch behavior is still needed, prefer a new
forward corrective migration.

### Archive / stale baseline divergence

- `origin/codex/archive-phase39-baseline-20260723`: 21 divergent files, mostly
  `20260717` to `20260719` settings, canonical document, attorney accounting,
  attorney role, MVP atomic transaction, and seller onboarding migrations.
- `origin/codex/mvp-pilot-readiness`: 33 divergent files, including older
  organisation, bond, finance, private listing, seller document, canonical
  document, attorney accounting, role, and MVP transaction migrations.
- `origin/codex/db-phase0-reconciliation`: 29 divergent files, mostly
  `20260714` to `20260716` reconciliation, OTP, attorney organisation, legal
  role, CEO dashboard, and attorney client financial document migrations.

Recommended action: archive/reference only unless a specific missing production
behavior is traced to one of these migrations. Do not merge these branches whole.

### Focused divergent paths

- `origin/codex/fix-seller-portal-token`
  - `supabase/migrations/202607160022_agent_legal_handoff_phase2.sql`
- `origin/codex/simple-connected-attorney-dropdown`
  - `supabase/migrations/20260719194500_seller_onboarding_preferred_transfer_attorney_acceptance.sql`
  - `supabase/migrations/20260719201000_mvp_atomic_transaction_creation_grant_hardening.sql`
- `origin/codex/wip-arch9-migration-reconciliation-20260723`
  - `supabase/migrations/20260719193500_mvp_atomic_transaction_creation_reconciliation.sql`
- `origin/codex/wip-shared-worktree-20260723`
  - `supabase/migrations/202607220015_bond_bank_outcomes_and_registration_handoff.sql`

Recommended action: inspect each diff manually if its paired app feature is
promoted. Otherwise leave main's historical migration untouched.

## Rename Drift

Some branches rename existing main migrations to different timestamp prefixes.
These are not fresh schema changes by themselves.

- `origin/codex/auth-bridge-bootstrap-timeout`: 17 renames from shorter
  timestamps to `00` suffix timestamps.
- `origin/codex/wip-arch9-migration-reconciliation-20260723`: the same 17
  `00` suffix renames plus one MVP atomic transaction reconciliation rename.
- `origin/codex/mvp-pilot-readiness`: 18 renames from `01` style split
  migrations into later numeric filenames.
- `origin/codex/db-phase0-reconciliation`: 1 rename from
  `202607050001_bond_grant_workflow_milestones.sql` to
  `202607140019_bond_grant_workflow_milestones_reconciliation.sql`.

Recommended action: do not promote rename drift through Git alone. First compare
against the Supabase remote migration ledger. If production has already applied
the main filename, create a new corrective migration instead of renaming history.

## Reconciliation Rules

1. Keep historical migrations on `main` immutable.
2. Promote branch-only migrations only after pairing them with the application
   commits that require them.
3. Treat same-name divergent migrations as review blockers.
4. Treat rename-only drift as ledger repair, not schema promotion.
5. Resolve the local uncommitted migration edit before any migration batch.
6. For needed changes buried in stale branches, create new forward migrations
   rather than replacing old files.
