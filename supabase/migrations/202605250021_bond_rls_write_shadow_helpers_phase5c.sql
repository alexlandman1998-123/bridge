begin;

create or replace function public.bridge_normalize_bond_write_action(action text)
returns text
language sql
immutable
as $$
  select
    case lower(coalesce(trim(action), ''))
      when 'finance_details_edit' then 'finance_details_edit'
      when 'finance_edit' then 'finance_details_edit'
      when 'finance_update' then 'finance_details_edit'
      when 'workflow_mutation' then 'workflow_mutation'
      when 'workflow_update' then 'workflow_mutation'
      when 'workflow_stage_update' then 'workflow_mutation'
      when 'document_upload' then 'document_upload'
      when 'upload_document' then 'document_upload'
      when 'bank_submission' then 'bank_submission'
      when 'submit_to_banks' then 'bank_submission'
      when 'bank_feedback_capture' then 'bank_feedback_capture'
      when 'record_bank_feedback' then 'bank_feedback_capture'
      when 'assignment_manage' then 'assignment_manage'
      when 'assignment_update' then 'assignment_manage'
      else null
    end
$$;

create or replace function public.bridge_has_bond_transaction_role_player_access(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.transaction_role_players trp
    where trp.transaction_id = transaction_id
      and (
        trp.user_id = auth.uid()
        or (
          trp.email_address is not null
          and lower(trp.email_address) = lower(coalesce((
            select coalesce(auth.jwt() ->> 'email', '')
          ), ''))
        )
      )
      and (
        lower(coalesce(trp.role_type, '')) in ('bond_originator', 'consultant')
        or lower(coalesce(trp.legal_role, '')) in ('bond_originator', 'consultant')
      )
  );
$$;

create or replace function public.bridge_can_mutate_bond_transaction_assigned(transaction_id uuid, action text)
returns boolean
language sql
stable
as $$
  with normalized as (
    select public.bridge_normalize_bond_write_action(action) as action_name
  )
  select
    coalesce(
      (
        select
          case
            when auth.uid() is null then false
            when (select action_name from normalized) is null then false
            when (select action_name from normalized) = 'finance_details_edit' then
              auth.uid() in (
                t.primary_bond_consultant_user_id,
                t.assigned_bond_processor_user_id,
                t.assigned_bond_manager_user_id
              )
            when (select action_name from normalized) in ('workflow_mutation', 'document_upload') then
              auth.uid() in (
                t.primary_bond_consultant_user_id,
                t.assigned_bond_processor_user_id,
                t.assigned_bond_manager_user_id,
                t.assigned_bond_compliance_user_id
              )
            when (select action_name from normalized) = 'bank_submission' then
              auth.uid() in (
                t.assigned_bond_processor_user_id,
                t.assigned_bond_manager_user_id
              )
            when (select action_name from normalized) = 'bank_feedback_capture' then
              auth.uid() in (
                t.assigned_bond_processor_user_id,
                t.assigned_bond_manager_user_id,
                t.assigned_bond_compliance_user_id
              )
            when (select action_name from normalized) = 'assignment_manage' then
              auth.uid() = t.assigned_bond_manager_user_id
            else false
          end
        from public.transactions t
        where t.id = transaction_id
        limit 1
      ),
      false
    );
$$;

create or replace function public.bridge_can_mutate_bond_transaction_scoped(transaction_id uuid, action text)
returns boolean
language sql
stable
as $$
  with normalized as (
    select public.bridge_normalize_bond_write_action(action) as action_name
  ),
  workspace_context as (
    select
      public.bridge_bond_transaction_workspace_id(transaction_id) as workspace_id,
      public.bridge_bond_transaction_region_id(transaction_id) as region_id,
      public.bridge_bond_transaction_workspace_unit_id(transaction_id) as workspace_unit_id
  ),
  membership_context as (
    select
      public.bridge_current_bond_scope_level((select workspace_id from workspace_context)) as scope_level,
      lower(coalesce(public.bridge_current_bond_workspace_role((select workspace_id from workspace_context)), '')) as workspace_role
  )
  select
    case
      when auth.uid() is null then false
      when (select action_name from normalized) is null then false
      when (select workspace_id from workspace_context) is null then false
      when public.bridge_is_bond_workspace_hq_member((select workspace_id from workspace_context)) then true
      when (select scope_level from membership_context) = 'region'
        and (select workspace_role from membership_context) in ('regional_manager', 'manager')
        and public.bridge_can_access_bond_region(
          (select workspace_id from workspace_context),
          (select region_id from workspace_context)
        ) then true
      when (select scope_level from membership_context) in ('branch', 'team')
        and (select workspace_role from membership_context) in ('branch_manager', 'team_lead', 'manager')
        and public.bridge_can_access_bond_workspace_unit(
          (select workspace_id from workspace_context),
          (select workspace_unit_id from workspace_context)
        ) then true
      else false
    end;
$$;

create or replace function public.bridge_can_mutate_bond_transaction_canonical(transaction_id uuid, action text)
returns boolean
language sql
stable
as $$
  with normalized as (
    select public.bridge_normalize_bond_write_action(action) as action_name
  )
  select
    case
      when auth.uid() is null then false
      when (select action_name from normalized) is null then false
      when public.bridge_can_mutate_bond_transaction_assigned(transaction_id, (select action_name from normalized)) then true
      when public.bridge_can_mutate_bond_transaction_scoped(transaction_id, (select action_name from normalized)) then true
      when (select action_name from normalized) in ('finance_details_edit', 'workflow_mutation', 'document_upload')
        and (
          public.bridge_has_bond_transaction_participant_access(transaction_id)
          or public.bridge_has_bond_transaction_role_player_access(transaction_id)
        ) then true
      else false
    end;
$$;

create or replace function public.bridge_can_mutate_bond_transaction_phase5c(transaction_id uuid, action text)
returns boolean
language sql
stable
as $$
  with normalized as (
    select public.bridge_normalize_bond_write_action(action) as action_name
  )
  select
    case
      when (select action_name from normalized) is null then false
      when public.bridge_is_bond_transaction_canonical_ready(transaction_id) then
        public.bridge_can_mutate_bond_transaction_canonical(transaction_id, (select action_name from normalized))
      else
        public.bridge_can_access_bond_transaction_legacy_compat(transaction_id)
    end;
$$;

grant execute on function public.bridge_normalize_bond_write_action(text) to authenticated;
grant execute on function public.bridge_has_bond_transaction_role_player_access(uuid) to authenticated;
grant execute on function public.bridge_can_mutate_bond_transaction_assigned(uuid, text) to authenticated;
grant execute on function public.bridge_can_mutate_bond_transaction_scoped(uuid, text) to authenticated;
grant execute on function public.bridge_can_mutate_bond_transaction_canonical(uuid, text) to authenticated;
grant execute on function public.bridge_can_mutate_bond_transaction_phase5c(uuid, text) to authenticated;

commit;
