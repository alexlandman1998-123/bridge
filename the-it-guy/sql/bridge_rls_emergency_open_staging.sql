begin;

-- Emergency staging rollback for Bridge RLS Pack 1.
-- Purpose: restore broad access so the app works again on staging.
-- Do NOT run on production.

-- Drop Pack 1 scoped policies if they exist.
drop policy if exists profiles_select_scoped on profiles;
drop policy if exists profiles_update_self on profiles;

drop policy if exists developments_select_scoped on developments;
drop policy if exists developments_insert_scoped on developments;
drop policy if exists developments_update_scoped on developments;

drop policy if exists units_select_scoped on units;
drop policy if exists units_modify_scoped on units;

drop policy if exists development_participants_select_scoped on development_participants;
drop policy if exists development_participants_modify_scoped on development_participants;

drop policy if exists development_settings_select_scoped on development_settings;
drop policy if exists development_settings_update_scoped on development_settings;

drop policy if exists development_attorney_configs_select_scoped on development_attorney_configs;
drop policy if exists development_attorney_configs_modify_scoped on development_attorney_configs;

drop policy if exists development_bond_configs_select_scoped on development_bond_configs;
drop policy if exists development_bond_configs_modify_scoped on development_bond_configs;

drop policy if exists development_attorney_required_closeout_docs_select_scoped on development_attorney_required_closeout_docs;
drop policy if exists development_bond_required_closeout_docs_select_scoped on development_bond_required_closeout_docs;

drop policy if exists transactions_select_scoped on transactions;
drop policy if exists transactions_insert_scoped on transactions;
drop policy if exists transactions_update_scoped on transactions;

drop policy if exists transaction_finance_details_select_scoped on transaction_finance_details;
drop policy if exists transaction_finance_details_modify_scoped on transaction_finance_details;

drop policy if exists transaction_subprocesses_select_scoped on transaction_subprocesses;
drop policy if exists transaction_subprocesses_modify_scoped on transaction_subprocesses;

drop policy if exists transaction_subprocess_steps_select_scoped on transaction_subprocess_steps;
drop policy if exists transaction_subprocess_steps_modify_scoped on transaction_subprocess_steps;

drop policy if exists transaction_participants_select_scoped on transaction_participants;
drop policy if exists transaction_participants_modify_scoped on transaction_participants;

drop policy if exists transaction_onboarding_select_scoped on transaction_onboarding;
drop policy if exists transaction_onboarding_modify_scoped on transaction_onboarding;

drop policy if exists onboarding_form_data_select_scoped on onboarding_form_data;
drop policy if exists onboarding_form_data_modify_scoped on onboarding_form_data;

drop policy if exists transaction_required_documents_select_scoped on transaction_required_documents;
drop policy if exists transaction_required_documents_modify_scoped on transaction_required_documents;

drop policy if exists documents_select_scoped on documents;
drop policy if exists documents_insert_scoped on documents;
drop policy if exists documents_update_scoped on documents;

drop policy if exists transaction_comments_select_scoped on transaction_comments;
drop policy if exists transaction_comments_insert_scoped on transaction_comments;

drop policy if exists transaction_events_select_scoped on transaction_events;
drop policy if exists transaction_events_insert_scoped on transaction_events;

drop policy if exists transaction_readiness_states_select_scoped on transaction_readiness_states;
drop policy if exists transaction_readiness_states_modify_scoped on transaction_readiness_states;

drop policy if exists transaction_notifications_select_scoped on transaction_notifications;
drop policy if exists transaction_notifications_modify_scoped on transaction_notifications;

drop policy if exists transaction_status_links_select_scoped on transaction_status_links;
drop policy if exists transaction_status_links_modify_scoped on transaction_status_links;

drop policy if exists transaction_external_access_select_scoped on transaction_external_access;
drop policy if exists transaction_external_access_modify_scoped on transaction_external_access;

drop policy if exists transaction_handover_select_scoped on transaction_handover;
drop policy if exists transaction_handover_modify_scoped on transaction_handover;

drop policy if exists transaction_occupational_rent_select_scoped on transaction_occupational_rent;
drop policy if exists transaction_occupational_rent_modify_scoped on transaction_occupational_rent;

drop policy if exists buyers_select_scoped on buyers;
drop policy if exists buyers_modify_scoped on buyers;

drop policy if exists client_issues_select_scoped on client_issues;
drop policy if exists client_issues_insert_scoped on client_issues;
drop policy if exists client_issues_update_scoped on client_issues;

drop policy if exists alteration_requests_select_scoped on alteration_requests;
drop policy if exists alteration_requests_modify_scoped on alteration_requests;

drop policy if exists service_reviews_select_scoped on service_reviews;
drop policy if exists service_reviews_modify_scoped on service_reviews;

drop policy if exists trust_investment_forms_select_scoped on trust_investment_forms;
drop policy if exists trust_investment_forms_modify_scoped on trust_investment_forms;

drop policy if exists notes_select_scoped on notes;
drop policy if exists notes_modify_scoped on notes;

drop policy if exists document_groups_select_scoped on document_groups;
drop policy if exists document_templates_select_scoped on document_templates;
drop policy if exists document_requirement_rules_select_scoped on document_requirement_rules;
drop policy if exists document_requirements_select_scoped on document_requirements;

drop policy if exists transaction_attorney_closeouts_select_scoped on transaction_attorney_closeouts;
drop policy if exists transaction_attorney_closeout_documents_select_scoped on transaction_attorney_closeout_documents;
drop policy if exists transaction_bond_closeouts_select_scoped on transaction_bond_closeouts;
drop policy if exists transaction_bond_closeout_documents_select_scoped on transaction_bond_closeout_documents;

drop policy if exists client_portal_links_select_scoped on client_portal_links;
drop policy if exists client_portal_links_modify_scoped on client_portal_links;

drop policy if exists snapshot_links_select_scoped on snapshot_links;
drop policy if exists snapshot_links_modify_scoped on snapshot_links;

-- Restore demo-open policies from schema.sql.
drop policy if exists profiles_demo_all on profiles;
create policy profiles_demo_all on profiles for all to anon, authenticated using (true) with check (true);

drop policy if exists developments_demo_all on developments;
create policy developments_demo_all on developments for all to anon, authenticated using (true) with check (true);

drop policy if exists units_demo_all on units;
create policy units_demo_all on units for all to anon, authenticated using (true) with check (true);

drop policy if exists buyers_demo_all on buyers;
create policy buyers_demo_all on buyers for all to anon, authenticated using (true) with check (true);

drop policy if exists transactions_demo_all on transactions;
create policy transactions_demo_all on transactions for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_finance_details_demo_all on transaction_finance_details;
create policy transaction_finance_details_demo_all on transaction_finance_details for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_subprocesses_demo_all on transaction_subprocesses;
create policy transaction_subprocesses_demo_all on transaction_subprocesses for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_subprocess_steps_demo_all on transaction_subprocess_steps;
create policy transaction_subprocess_steps_demo_all on transaction_subprocess_steps for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_onboarding_demo_all on transaction_onboarding;
create policy transaction_onboarding_demo_all on transaction_onboarding for all to anon, authenticated using (true) with check (true);

drop policy if exists onboarding_form_data_demo_all on onboarding_form_data;
create policy onboarding_form_data_demo_all on onboarding_form_data for all to anon, authenticated using (true) with check (true);

drop policy if exists document_groups_demo_all on document_groups;
create policy document_groups_demo_all on document_groups for all to anon, authenticated using (true) with check (true);

drop policy if exists document_templates_demo_all on document_templates;
create policy document_templates_demo_all on document_templates for all to anon, authenticated using (true) with check (true);

drop policy if exists document_requirement_rules_demo_all on document_requirement_rules;
create policy document_requirement_rules_demo_all on document_requirement_rules for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_required_documents_demo_all on transaction_required_documents;
create policy transaction_required_documents_demo_all on transaction_required_documents for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_participants_demo_all on transaction_participants;
create policy transaction_participants_demo_all on transaction_participants for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_comments_demo_all on transaction_comments;
create policy transaction_comments_demo_all on transaction_comments for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_status_links_demo_all on transaction_status_links;
create policy transaction_status_links_demo_all on transaction_status_links for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_events_demo_all on transaction_events;
create policy transaction_events_demo_all on transaction_events for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_readiness_states_demo_all on transaction_readiness_states;
create policy transaction_readiness_states_demo_all on transaction_readiness_states for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_notifications_demo_all on transaction_notifications;
create policy transaction_notifications_demo_all on transaction_notifications for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_external_access_demo_all on transaction_external_access;
create policy transaction_external_access_demo_all on transaction_external_access for all to anon, authenticated using (true) with check (true);

drop policy if exists development_settings_demo_all on development_settings;
create policy development_settings_demo_all on development_settings for all to anon, authenticated using (true) with check (true);

drop policy if exists development_attorney_configs_demo_all on development_attorney_configs;
create policy development_attorney_configs_demo_all on development_attorney_configs for all to anon, authenticated using (true) with check (true);

drop policy if exists development_attorney_required_closeout_docs_demo_all on development_attorney_required_closeout_docs;
create policy development_attorney_required_closeout_docs_demo_all on development_attorney_required_closeout_docs for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_attorney_closeouts_demo_all on transaction_attorney_closeouts;
create policy transaction_attorney_closeouts_demo_all on transaction_attorney_closeouts for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_attorney_closeout_documents_demo_all on transaction_attorney_closeout_documents;
create policy transaction_attorney_closeout_documents_demo_all on transaction_attorney_closeout_documents for all to anon, authenticated using (true) with check (true);

drop policy if exists development_bond_configs_demo_all on development_bond_configs;
create policy development_bond_configs_demo_all on development_bond_configs for all to anon, authenticated using (true) with check (true);

drop policy if exists development_bond_required_closeout_docs_demo_all on development_bond_required_closeout_docs;
create policy development_bond_required_closeout_docs_demo_all on development_bond_required_closeout_docs for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_bond_closeouts_demo_all on transaction_bond_closeouts;
create policy transaction_bond_closeouts_demo_all on transaction_bond_closeouts for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_bond_closeout_documents_demo_all on transaction_bond_closeout_documents;
create policy transaction_bond_closeout_documents_demo_all on transaction_bond_closeout_documents for all to anon, authenticated using (true) with check (true);

drop policy if exists client_portal_links_demo_all on client_portal_links;
create policy client_portal_links_demo_all on client_portal_links for all to anon, authenticated using (true) with check (true);

drop policy if exists client_issues_demo_all on client_issues;
create policy client_issues_demo_all on client_issues for all to anon, authenticated using (true) with check (true);

drop policy if exists alteration_requests_demo_all on alteration_requests;
create policy alteration_requests_demo_all on alteration_requests for all to anon, authenticated using (true) with check (true);

drop policy if exists service_reviews_demo_all on service_reviews;
create policy service_reviews_demo_all on service_reviews for all to anon, authenticated using (true) with check (true);

drop policy if exists trust_investment_forms_demo_all on trust_investment_forms;
create policy trust_investment_forms_demo_all on trust_investment_forms for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_handover_demo_all on transaction_handover;
create policy transaction_handover_demo_all on transaction_handover for all to anon, authenticated using (true) with check (true);

drop policy if exists snapshot_links_demo_all on snapshot_links;
create policy snapshot_links_demo_all on snapshot_links for all to anon, authenticated using (true) with check (true);

drop policy if exists notes_demo_all on notes;
create policy notes_demo_all on notes for all to anon, authenticated using (true) with check (true);

drop policy if exists documents_demo_all on documents;
create policy documents_demo_all on documents for all to anon, authenticated using (true) with check (true);

drop policy if exists document_requirements_demo_all on document_requirements;
create policy document_requirements_demo_all on document_requirements for all to anon, authenticated using (true) with check (true);

-- New Pack 1 tables were not covered by the original demo-open policies.
drop policy if exists development_participants_demo_all on development_participants;
create policy development_participants_demo_all on development_participants for all to anon, authenticated using (true) with check (true);

drop policy if exists transaction_occupational_rent_demo_all on transaction_occupational_rent;
create policy transaction_occupational_rent_demo_all on transaction_occupational_rent for all to anon, authenticated using (true) with check (true);

commit;
