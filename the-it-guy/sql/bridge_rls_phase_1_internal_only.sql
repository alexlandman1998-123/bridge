begin;

-- Bridge RLS Phase 1: internal-first, client-portal-compatible
--
-- Goal:
-- - move internal roles to scoped authenticated access
-- - keep the current token/anon client portal behavior alive for now
--
-- Important:
-- - staging only
-- - not production-safe for client-facing tables
-- - client-facing tables keep anon-open access temporarily

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

create or replace function public.bridge_current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.bridge_current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

create or replace function public.bridge_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_users ou
    where ou.user_id = auth.uid()
      and ou.role = 'admin'
      and ou.status = 'active'
  )
$$;

create or replace function public.bridge_is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.bridge_is_admin()
    or public.bridge_current_profile_role() in ('developer', 'agent', 'attorney', 'bond_originator')
$$;

create or replace function public.bridge_has_development_access(target_development_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when auth.uid() is null then false
      when public.bridge_is_admin() then true
      when exists (
        select 1
        from public.development_participants dp
        where dp.development_id = target_development_id
          and dp.is_active = true
          and dp.can_view = true
          and (
            dp.user_id = auth.uid()
            or lower(coalesce(dp.participant_email, '')) = public.bridge_current_user_email()
          )
      ) then true
      when exists (
        select 1
        from public.transactions t
        join public.transaction_participants tp
          on tp.transaction_id = t.id
        where t.development_id = target_development_id
          and tp.can_view = true
          and (
            tp.user_id = auth.uid()
            or lower(coalesce(tp.participant_email, '')) = public.bridge_current_user_email()
          )
      ) then true
      else false
    end
$$;

create or replace function public.bridge_has_transaction_access(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when auth.uid() is null then false
      when public.bridge_is_admin() then true
      when exists (
        select 1
        from public.transaction_participants tp
        where tp.transaction_id = target_transaction_id
          and tp.can_view = true
          and (
            tp.user_id = auth.uid()
            or lower(coalesce(tp.participant_email, '')) = public.bridge_current_user_email()
          )
      ) then true
      when exists (
        select 1
        from public.transactions t
        where t.id = target_transaction_id
          and (
            (
              public.bridge_current_profile_role() = 'developer'
              and t.development_id is not null
              and public.bridge_has_development_access(t.development_id)
            )
            or (
              public.bridge_current_profile_role() = 'agent'
              and lower(coalesce(t.assigned_agent_email, '')) = public.bridge_current_user_email()
            )
            or (
              public.bridge_current_profile_role() = 'attorney'
              and lower(coalesce(t.assigned_attorney_email, '')) = public.bridge_current_user_email()
            )
            or (
              public.bridge_current_profile_role() = 'bond_originator'
              and lower(coalesce(t.assigned_bond_originator_email, '')) = public.bridge_current_user_email()
            )
          )
      ) then true
      else false
    end
$$;

create or replace function public.bridge_can_edit_main_stage(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.bridge_is_admin()
    or (
      public.bridge_has_transaction_access(target_transaction_id)
      and public.bridge_current_profile_role() in ('developer', 'agent')
    )
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = target_transaction_id
        and (
          tp.user_id = auth.uid()
          or lower(coalesce(tp.participant_email, '')) = public.bridge_current_user_email()
        )
        and tp.can_edit_core_transaction = true
    )
$$;

create or replace function public.bridge_can_edit_finance_lane(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.bridge_is_admin()
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = target_transaction_id
        and (
          tp.user_id = auth.uid()
          or lower(coalesce(tp.participant_email, '')) = public.bridge_current_user_email()
        )
        and tp.can_edit_finance_workflow = true
    )
    or exists (
      select 1
      from public.transactions t
      where t.id = target_transaction_id
        and public.bridge_current_profile_role() = 'bond_originator'
        and lower(coalesce(t.assigned_bond_originator_email, '')) = public.bridge_current_user_email()
    )
$$;

create or replace function public.bridge_can_edit_attorney_lane(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.bridge_is_admin()
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = target_transaction_id
        and (
          tp.user_id = auth.uid()
          or lower(coalesce(tp.participant_email, '')) = public.bridge_current_user_email()
        )
        and tp.can_edit_attorney_workflow = true
    )
    or exists (
      select 1
      from public.transactions t
      where t.id = target_transaction_id
        and public.bridge_current_profile_role() = 'attorney'
        and lower(coalesce(t.assigned_attorney_email, '')) = public.bridge_current_user_email()
    )
$$;

create or replace function public.bridge_can_manage_handover(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.bridge_is_admin()
    or (
      public.bridge_has_transaction_access(target_transaction_id)
      and public.bridge_current_profile_role() = 'developer'
    )
$$;

create or replace function public.bridge_can_manage_snags(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.bridge_is_admin()
    or (
      public.bridge_has_transaction_access(target_transaction_id)
      and public.bridge_current_profile_role() = 'developer'
    )
$$;

-- ---------------------------------------------------------------------------
-- Remove demo-open policies only from internal-facing tables
-- ---------------------------------------------------------------------------

drop policy if exists profiles_demo_all on profiles;
drop policy if exists developments_demo_all on developments;
drop policy if exists units_demo_all on units;
drop policy if exists transactions_demo_all on transactions;
drop policy if exists transaction_finance_details_demo_all on transaction_finance_details;
drop policy if exists transaction_subprocesses_demo_all on transaction_subprocesses;
drop policy if exists transaction_subprocess_steps_demo_all on transaction_subprocess_steps;
drop policy if exists transaction_participants_demo_all on transaction_participants;
drop policy if exists transaction_readiness_states_demo_all on transaction_readiness_states;
drop policy if exists transaction_notifications_demo_all on transaction_notifications;
drop policy if exists transaction_external_access_demo_all on transaction_external_access;
drop policy if exists development_settings_demo_all on development_settings;
drop policy if exists development_attorney_configs_demo_all on development_attorney_configs;
drop policy if exists development_attorney_required_closeout_docs_demo_all on development_attorney_required_closeout_docs;
drop policy if exists development_bond_configs_demo_all on development_bond_configs;
drop policy if exists development_bond_required_closeout_docs_demo_all on development_bond_required_closeout_docs;
drop policy if exists transaction_attorney_closeouts_demo_all on transaction_attorney_closeouts;
drop policy if exists transaction_attorney_closeout_documents_demo_all on transaction_attorney_closeout_documents;
drop policy if exists transaction_bond_closeouts_demo_all on transaction_bond_closeouts;
drop policy if exists transaction_bond_closeout_documents_demo_all on transaction_bond_closeout_documents;
drop policy if exists notes_demo_all on notes;
drop policy if exists development_participants_demo_all on development_participants;
drop policy if exists transaction_occupational_rent_demo_all on transaction_occupational_rent;

-- ---------------------------------------------------------------------------
-- Scoped internal policies
-- ---------------------------------------------------------------------------

drop policy if exists profiles_select_scoped on profiles;
create policy profiles_select_scoped on profiles
for select to authenticated
using (
  id = auth.uid()
  or public.bridge_is_internal_user()
);

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
for update to authenticated
using (id = auth.uid() or public.bridge_is_admin())
with check (id = auth.uid() or public.bridge_is_admin());

drop policy if exists developments_select_scoped on developments;
create policy developments_select_scoped on developments
for select to authenticated
using (public.bridge_has_development_access(id));

drop policy if exists developments_insert_scoped on developments;
create policy developments_insert_scoped on developments
for insert to authenticated
with check (
  public.bridge_is_admin()
  or public.bridge_current_profile_role() = 'developer'
);

drop policy if exists developments_update_scoped on developments;
create policy developments_update_scoped on developments
for update to authenticated
using (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_development_access(id)
  )
)
with check (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_development_access(id)
  )
);

drop policy if exists units_select_scoped on units;
create policy units_select_scoped on units
for select to authenticated
using (public.bridge_has_development_access(development_id));

drop policy if exists units_modify_scoped on units;
create policy units_modify_scoped on units
for all to authenticated
using (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_development_access(development_id)
  )
)
with check (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_development_access(development_id)
  )
);

drop policy if exists development_participants_select_scoped on development_participants;
create policy development_participants_select_scoped on development_participants
for select to authenticated
using (public.bridge_has_development_access(development_id));

drop policy if exists development_participants_modify_scoped on development_participants;
create policy development_participants_modify_scoped on development_participants
for all to authenticated
using (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_development_access(development_id)
  )
)
with check (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_development_access(development_id)
  )
);

drop policy if exists development_settings_select_scoped on development_settings;
create policy development_settings_select_scoped on development_settings
for select to authenticated
using (public.bridge_has_development_access(development_id));

drop policy if exists development_settings_update_scoped on development_settings;
create policy development_settings_update_scoped on development_settings
for update to authenticated
using (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_development_access(development_id)
  )
)
with check (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_development_access(development_id)
  )
);

drop policy if exists development_attorney_configs_select_scoped on development_attorney_configs;
create policy development_attorney_configs_select_scoped on development_attorney_configs
for select to authenticated
using (public.bridge_has_development_access(development_id));

drop policy if exists development_attorney_configs_modify_scoped on development_attorney_configs;
create policy development_attorney_configs_modify_scoped on development_attorney_configs
for all to authenticated
using (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_development_access(development_id)
  )
)
with check (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_development_access(development_id)
  )
);

drop policy if exists development_bond_configs_select_scoped on development_bond_configs;
create policy development_bond_configs_select_scoped on development_bond_configs
for select to authenticated
using (public.bridge_has_development_access(development_id));

drop policy if exists development_bond_configs_modify_scoped on development_bond_configs;
create policy development_bond_configs_modify_scoped on development_bond_configs
for all to authenticated
using (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_development_access(development_id)
  )
)
with check (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_development_access(development_id)
  )
);

drop policy if exists development_attorney_required_closeout_docs_select_scoped on development_attorney_required_closeout_docs;
create policy development_attorney_required_closeout_docs_select_scoped on development_attorney_required_closeout_docs
for select to authenticated
using (
  exists (
    select 1
    from development_attorney_configs dac
    where dac.id = development_attorney_required_closeout_docs.development_attorney_config_id
      and public.bridge_has_development_access(dac.development_id)
  )
);

drop policy if exists development_bond_required_closeout_docs_select_scoped on development_bond_required_closeout_docs;
create policy development_bond_required_closeout_docs_select_scoped on development_bond_required_closeout_docs
for select to authenticated
using (
  exists (
    select 1
    from development_bond_configs dbc
    where dbc.id = development_bond_required_closeout_docs.development_bond_config_id
      and public.bridge_has_development_access(dbc.development_id)
  )
);

drop policy if exists transactions_select_scoped on transactions;
create policy transactions_select_scoped on transactions
for select to authenticated
using (public.bridge_has_transaction_access(id));

drop policy if exists transactions_insert_scoped on transactions;
create policy transactions_insert_scoped on transactions
for insert to authenticated
with check (
  public.bridge_is_admin()
  or public.bridge_current_profile_role() in ('developer', 'agent', 'attorney')
);

drop policy if exists transactions_update_scoped on transactions;
create policy transactions_update_scoped on transactions
for update to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_can_edit_main_stage(id)
)
with check (
  public.bridge_is_admin()
  or public.bridge_can_edit_main_stage(id)
);

drop policy if exists transaction_finance_details_select_scoped on transaction_finance_details;
create policy transaction_finance_details_select_scoped on transaction_finance_details
for select to authenticated
using (public.bridge_has_transaction_access(transaction_id));

drop policy if exists transaction_finance_details_modify_scoped on transaction_finance_details;
create policy transaction_finance_details_modify_scoped on transaction_finance_details
for all to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_can_edit_finance_lane(transaction_id)
)
with check (
  public.bridge_is_admin()
  or public.bridge_can_edit_finance_lane(transaction_id)
);

drop policy if exists transaction_subprocesses_select_scoped on transaction_subprocesses;
create policy transaction_subprocesses_select_scoped on transaction_subprocesses
for select to authenticated
using (public.bridge_has_transaction_access(transaction_id));

drop policy if exists transaction_subprocesses_modify_scoped on transaction_subprocesses;
create policy transaction_subprocesses_modify_scoped on transaction_subprocesses
for all to authenticated
using (
  public.bridge_is_admin()
  or (
    process_type = 'finance'
    and public.bridge_can_edit_finance_lane(transaction_id)
  )
  or (
    process_type = 'attorney'
    and public.bridge_can_edit_attorney_lane(transaction_id)
  )
)
with check (
  public.bridge_is_admin()
  or (
    process_type = 'finance'
    and public.bridge_can_edit_finance_lane(transaction_id)
  )
  or (
    process_type = 'attorney'
    and public.bridge_can_edit_attorney_lane(transaction_id)
  )
);

drop policy if exists transaction_subprocess_steps_select_scoped on transaction_subprocess_steps;
create policy transaction_subprocess_steps_select_scoped on transaction_subprocess_steps
for select to authenticated
using (
  exists (
    select 1
    from transaction_subprocesses tsp
    where tsp.id = transaction_subprocess_steps.subprocess_id
      and public.bridge_has_transaction_access(tsp.transaction_id)
  )
);

drop policy if exists transaction_subprocess_steps_modify_scoped on transaction_subprocess_steps;
create policy transaction_subprocess_steps_modify_scoped on transaction_subprocess_steps
for all to authenticated
using (
  exists (
    select 1
    from transaction_subprocesses tsp
    where tsp.id = transaction_subprocess_steps.subprocess_id
      and (
        public.bridge_is_admin()
        or (
          tsp.process_type = 'finance'
          and public.bridge_can_edit_finance_lane(tsp.transaction_id)
        )
        or (
          tsp.process_type = 'attorney'
          and public.bridge_can_edit_attorney_lane(tsp.transaction_id)
        )
      )
  )
)
with check (
  exists (
    select 1
    from transaction_subprocesses tsp
    where tsp.id = transaction_subprocess_steps.subprocess_id
      and (
        public.bridge_is_admin()
        or (
          tsp.process_type = 'finance'
          and public.bridge_can_edit_finance_lane(tsp.transaction_id)
        )
        or (
          tsp.process_type = 'attorney'
          and public.bridge_can_edit_attorney_lane(tsp.transaction_id)
        )
      )
  )
);

drop policy if exists transaction_participants_select_scoped on transaction_participants;
create policy transaction_participants_select_scoped on transaction_participants
for select to authenticated
using (public.bridge_has_transaction_access(transaction_id));

drop policy if exists transaction_participants_insert_scoped on transaction_participants;
create policy transaction_participants_insert_scoped on transaction_participants
for insert to authenticated
with check (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_transaction_access(transaction_id)
  )
);

drop policy if exists transaction_participants_update_scoped on transaction_participants;
create policy transaction_participants_update_scoped on transaction_participants
for update to authenticated
using (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_transaction_access(transaction_id)
  )
)
with check (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_transaction_access(transaction_id)
  )
);

drop policy if exists transaction_participants_delete_scoped on transaction_participants;
create policy transaction_participants_delete_scoped on transaction_participants
for delete to authenticated
using (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_transaction_access(transaction_id)
  )
);

drop policy if exists transaction_readiness_states_select_scoped on transaction_readiness_states;
create policy transaction_readiness_states_select_scoped on transaction_readiness_states
for select to authenticated
using (public.bridge_has_transaction_access(transaction_id));

drop policy if exists transaction_readiness_states_modify_scoped on transaction_readiness_states;
create policy transaction_readiness_states_modify_scoped on transaction_readiness_states
for all to authenticated
using (
  public.bridge_is_admin()
  or (
    public.bridge_is_internal_user()
    and public.bridge_has_transaction_access(transaction_id)
  )
)
with check (
  public.bridge_is_admin()
  or (
    public.bridge_is_internal_user()
    and public.bridge_has_transaction_access(transaction_id)
  )
);

drop policy if exists transaction_notifications_select_scoped on transaction_notifications;
create policy transaction_notifications_select_scoped on transaction_notifications
for select to authenticated
using (
  user_id = auth.uid()
  or public.bridge_is_admin()
);

drop policy if exists transaction_notifications_modify_scoped on transaction_notifications;
create policy transaction_notifications_modify_scoped on transaction_notifications
for all to authenticated
using (
  public.bridge_is_admin()
  or user_id = auth.uid()
)
with check (
  public.bridge_is_admin()
  or user_id = auth.uid()
);

drop policy if exists transaction_external_access_select_scoped on transaction_external_access;
create policy transaction_external_access_select_scoped on transaction_external_access
for select to authenticated
using (public.bridge_has_transaction_access(transaction_id));

drop policy if exists transaction_external_access_modify_scoped on transaction_external_access;
create policy transaction_external_access_modify_scoped on transaction_external_access
for all to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_can_edit_main_stage(transaction_id)
)
with check (
  public.bridge_is_admin()
  or public.bridge_can_edit_main_stage(transaction_id)
);

drop policy if exists transaction_occupational_rent_select_scoped on transaction_occupational_rent;
create policy transaction_occupational_rent_select_scoped on transaction_occupational_rent
for select to authenticated
using (public.bridge_has_transaction_access(transaction_id));

drop policy if exists transaction_occupational_rent_modify_scoped on transaction_occupational_rent;
create policy transaction_occupational_rent_modify_scoped on transaction_occupational_rent
for all to authenticated
using (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_transaction_access(transaction_id)
  )
)
with check (
  public.bridge_is_admin()
  or (
    public.bridge_current_profile_role() = 'developer'
    and public.bridge_has_transaction_access(transaction_id)
  )
);

drop policy if exists notes_select_scoped on notes;
create policy notes_select_scoped on notes
for select to authenticated
using (public.bridge_has_transaction_access(transaction_id));

drop policy if exists notes_modify_scoped on notes;
create policy notes_modify_scoped on notes
for all to authenticated
using (
  public.bridge_is_internal_user()
  and public.bridge_has_transaction_access(transaction_id)
)
with check (
  public.bridge_is_internal_user()
  and public.bridge_has_transaction_access(transaction_id)
);

drop policy if exists transaction_attorney_closeouts_select_scoped on transaction_attorney_closeouts;
create policy transaction_attorney_closeouts_select_scoped on transaction_attorney_closeouts
for select to authenticated
using (public.bridge_has_transaction_access(transaction_id));

drop policy if exists transaction_attorney_closeout_documents_select_scoped on transaction_attorney_closeout_documents;
create policy transaction_attorney_closeout_documents_select_scoped on transaction_attorney_closeout_documents
for select to authenticated
using (
  exists (
    select 1
    from transaction_attorney_closeouts tac
    where tac.id = transaction_attorney_closeout_documents.transaction_attorney_closeout_id
      and public.bridge_has_transaction_access(tac.transaction_id)
  )
);

drop policy if exists transaction_bond_closeouts_select_scoped on transaction_bond_closeouts;
create policy transaction_bond_closeouts_select_scoped on transaction_bond_closeouts
for select to authenticated
using (public.bridge_has_transaction_access(transaction_id));

drop policy if exists transaction_bond_closeout_documents_select_scoped on transaction_bond_closeout_documents;
create policy transaction_bond_closeout_documents_select_scoped on transaction_bond_closeout_documents
for select to authenticated
using (
  exists (
    select 1
    from transaction_bond_closeouts tbc
    where tbc.id = transaction_bond_closeout_documents.transaction_bond_closeout_id
      and public.bridge_has_transaction_access(tbc.transaction_id)
  )
);

-- ---------------------------------------------------------------------------
-- Keep client-facing tables token-compatible for now
-- ---------------------------------------------------------------------------

drop policy if exists buyers_demo_all on buyers;
create policy buyers_demo_all on buyers
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_onboarding_demo_all on transaction_onboarding;
create policy transaction_onboarding_demo_all on transaction_onboarding
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists onboarding_form_data_demo_all on onboarding_form_data;
create policy onboarding_form_data_demo_all on onboarding_form_data
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists document_groups_demo_all on document_groups;
create policy document_groups_demo_all on document_groups
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists document_templates_demo_all on document_templates;
create policy document_templates_demo_all on document_templates
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists document_requirement_rules_demo_all on document_requirement_rules;
create policy document_requirement_rules_demo_all on document_requirement_rules
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_required_documents_demo_all on transaction_required_documents;
create policy transaction_required_documents_demo_all on transaction_required_documents
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_comments_demo_all on transaction_comments;
create policy transaction_comments_demo_all on transaction_comments
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_status_links_demo_all on transaction_status_links;
create policy transaction_status_links_demo_all on transaction_status_links
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_events_demo_all on transaction_events;
create policy transaction_events_demo_all on transaction_events
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists client_portal_links_demo_all on client_portal_links;
create policy client_portal_links_demo_all on client_portal_links
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists client_issues_demo_all on client_issues;
create policy client_issues_demo_all on client_issues
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists alteration_requests_demo_all on alteration_requests;
create policy alteration_requests_demo_all on alteration_requests
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists service_reviews_demo_all on service_reviews;
create policy service_reviews_demo_all on service_reviews
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists trust_investment_forms_demo_all on trust_investment_forms;
create policy trust_investment_forms_demo_all on trust_investment_forms
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transaction_handover_demo_all on transaction_handover;
create policy transaction_handover_demo_all on transaction_handover
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists snapshot_links_demo_all on snapshot_links;
create policy snapshot_links_demo_all on snapshot_links
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists documents_demo_all on documents;
create policy documents_demo_all on documents
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists document_requirements_demo_all on document_requirements;
create policy document_requirements_demo_all on document_requirements
for all to anon, authenticated
using (true)
with check (true);

commit;
