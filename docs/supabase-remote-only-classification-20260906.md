# Supabase Remote-Only Migration Classification

Generated: 6 September 2026

## Scope and safety

This report classifies and records the source-history restoration of the 63
pure remote-only versions in linked production project `isdowlnollckzvltkasn`.
The SQL was fetched into an isolated temporary directory, verified by version,
and restored byte-for-byte to `supabase/migrations`. No SQL, `db push`,
`db reset`, or migration repair was executed against a database.

All 63 SQL bodies are recoverable from the linked migration history. None of
the 63 versions exists in any currently reachable Git ref.

## Classification summary

| Classification | Count | Decision |
| --- | ---: | --- |
| Unique remote history | 47 | Restored exactly from the production history table. |
| Normalized-equivalent retimestamp | 2 | Remote timestamp retained as canonical; unapplied local duplicate retired. |
| Same-name, different-SQL pair | 14 | Remote applied history restored; 15 materially different local successors retained as pending migrations. |
| Unrecoverable | 0 | No missing SQL bodies. |

Module distribution: rental 42, developer/referral 4, transaction network 4,
bond finance 4, website publication 4, workspace platform 2, attorney 1,
lead capture/CRM 1, and canonical documents 1.

## Normalized-equivalent retimestamps

Comments, whitespace, and trailing duplicate semicolons were ignored for this
comparison. The executable SQL is otherwise equivalent.

| Remote version | Remote file | Local counterpart |
| --- | --- | --- |
| `20260902074632` | `hide_non_building_harbour_heights_map_markers` | `20260902074000_hide_non_building_harbour_heights_map_markers.sql` |
| `20260902085246` | `allow_platform_admin_profile_role` | `20260902085300_allow_platform_admin_profile_role.sql` |

## Same-name pairs with materially different SQL

These entries were confirmed to contain materially different SQL. The remote
file is retained as applied history and the local counterpart remains a
distinct pending successor. They are not timestamp aliases.

| Remote version | Local counterpart(s) |
| --- | --- |
| `20260829203552_rental_application_documents.sql` | `20260905141016_rental_application_documents.sql` |
| `20260829203648_rental_application_submission.sql` | `20260905141015_rental_application_submission.sql` |
| `20260829203735_rental_application_review_workspace.sql` | `20260905141017_rental_application_review_workspace.sql` |
| `20260829204144_rental_application_screening.sql` | `20260905141018_rental_application_screening.sql` |
| `20260829204623_rental_application_screening_reviewer_actor.sql` | `20260905141019_rental_application_screening_reviewer_actor.sql` |
| `20260829204840_rental_application_decisions.sql` | `20260905141020_rental_application_decisions.sql` |
| `20260829210157_rental_application_tenancy_conversion.sql` | `20260905141021_rental_application_tenancy_conversion.sql` |
| `20260831125342_canonical_transaction_requirements_on_creation.sql` | `20260831071807_canonical_transaction_requirements_on_creation.sql`; `20260831072652_canonical_transaction_requirements_on_creation.sql` |
| `20260902064058_harden_admin_portal_authorization.sql` | `20260901140943_harden_admin_portal_authorization.sql` |
| `20260905173226_development_visual_analytics_phase14.sql` | `20260905150420_development_visual_analytics_phase14.sql` |
| `20260906112843_public_websites_pilot_closeout_phase6_hypercare.sql` | `20260906133000_public_websites_pilot_closeout_phase6_hypercare.sql` |
| `20260906112854_public_websites_pilot_closeout_phase6_hypercare_indexes.sql` | `20260906134500_public_websites_pilot_closeout_phase6_hypercare_indexes.sql` |
| `20260906113258_public_websites_pilot_closeout_phase5_go_live.sql` | `20260906123000_public_websites_pilot_closeout_phase5_go_live.sql` |
| `20260906113353_public_websites_pilot_closeout_phase6_approval_gate.sql` | `20260906140000_public_websites_pilot_closeout_phase6_approval_gate.sql` |

## Unique remote history candidates

These have no same-named local counterpart. Their exact SQL was restored from
the linked migration history. They must not be executed against production
again because their versions are already recorded there.

### Rental (35)

`20260830084850_rental_lease_versions.sql`,
`20260830085317_rental_lease_manual_signing.sql`,
`20260830085705_rental_move_in_readiness.sql`,
`20260830090204_rental_incoming_inspection.sql`,
`20260830091124_rental_tenancy_activation.sql`,
`20260830091652_rental_tenancy_workspace.sql`,
`20260830092741_rental_financial_model.sql`,
`20260830093509_rental_charge_schedules.sql`,
`20260830094123_rental_payment_capture.sql`,
`20260830095017_rental_payment_allocations_fix.sql`,
`20260830095430_rental_payment_allocation_splits.sql`,
`20260830100753_rental_financial_corrections_core.sql`,
`20260830100807_rental_financial_correction_balances.sql`,
`20260830100936_rental_financial_period_controls.sql`,
`20260830101115_rental_financial_adjustment_reversal.sql`,
`20260830101259_rental_arrears_collections_dashboard.sql`,
`20260830101318_rental_arrears_summary_reconciliation.sql`,
`20260830101846_rental_financial_imports.sql`,
`20260830102633_rental_maintenance_request_intake.sql`,
`20260830102724_rental_maintenance_triage_assignment.sql`,
`20260830102811_rental_maintenance_quotes_approvals.sql`,
`20260830102846_rental_maintenance_execution_completion.sql`,
`20260830102937_rental_mobile_inspections.sql`,
`20260830103810_rental_collection_reminders_repair.sql`,
`20260830103913_rental_inspection_templates_scheduling.sql`,
`20260830104159_rental_schema_reconciliation_repair.sql`,
`20260830104242_rental_trigger_search_path_hardening.sql`,
`20260830105816_rental_media_upload_hardening.sql`,
`20260830105908_rental_media_upload_policy_path_fix.sql`,
`20260830110749_rental_tenant_portal_actions.sql`,
`20260830111228_rental_landlord_portal_decisions.sql`,
`20260830111659_rental_landlord_portal_read_models.sql`,
`20260830113004_rental_renewal_workflow.sql`,
`20260830113531_rental_renewal_lease_version.sql`, and
`20260830114448_rental_notice_capture.sql`.

### Other modules (12)

| Module | Remote file |
| --- | --- |
| Developer/referral | `20260817065106_development_financial_defaults_phase1_missing_columns.sql` |
| Lead capture/CRM | `20260820110704_property24_listing_syncs.sql` |
| Transaction network | `20260827102952_repair_partner_pipeline_assignment_scope.sql` |
| Attorney | `20260827104611_repair_attorney_incoming_matter_visible_status.sql` |
| Bond finance | `20260827131153_repair_bond_originator_transaction_scope.sql` |
| Bond finance | `20260827133621_repair_missing_roleplayer_bond_handoffs.sql` |
| Bond finance | `20260827133842_repair_missing_roleplayer_bond_handoffs_execution.sql` |
| Transaction network | `20260827133951_repair_roleplayer_participant_scope_alignment.sql` |
| Transaction network | `20260827185146_allow_transaction_spine_roleplayers_to_read_linked_transaction_entities.sql` |
| Bond finance | `20260828203637_agent_bond_application_rpc_acl_hardening.sql` |
| Developer/referral | `20260831074851_developer_document_portal_sale_route_followup.sql` |
| Canonical documents | `20260831205101_canonical_document_identity_and_portal_requests.sql` |

## Completion evidence

The post-restoration live reconciliation reports 895 matched rows, zero pure
remote-only rows, 93 pure local-only rows, and one reviewed split-ledger row.
There are 989 local migration files and no duplicate local timestamps. The two
retired local aliases account for the reduction from 95 to 93 local-only rows.

The remaining work is exclusively the evidence-backed processing of the 93
local-only successors. The broad-push freeze remains active.
