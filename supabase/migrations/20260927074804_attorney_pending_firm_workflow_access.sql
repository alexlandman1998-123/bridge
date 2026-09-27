begin;

-- A firm may begin work once instructed. Individual allocation still controls
-- visibility, and paused/removed assignments remain read-only.
create or replace function public.bridge_attorney_matter_team_access(
  p_transaction_id uuid,
  p_firm_id uuid,
  p_capability text default 'view'
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_principal boolean;
  v_worker boolean;
  v_assignment_workable boolean;
begin
  if v_actor is null or p_transaction_id is null or p_firm_id is null
    or p_capability not in ('view', 'workflow', 'manage') then return false; end if;
  select
    coalesce(member.professional_role in ('firm_admin', 'director_partner')
      or member.role in ('firm_admin', 'director_partner'), false),
    coalesce(member.professional_role in (
      'firm_admin', 'director_partner', 'attorney_conveyancer',
      'conveyancing_secretary', 'candidate_attorney', 'admin_staff'
    ) or member.role in (
      'firm_admin', 'director_partner', 'transfer_attorney', 'bond_attorney',
      'cancellation_attorney', 'conveyancing_secretary', 'candidate_attorney', 'admin_staff'
    ), false)
  into v_principal, v_worker
  from public.attorney_firm_members member
  where member.firm_id = p_firm_id and member.user_id = v_actor
    and member.status = 'active'
  limit 1;
  if not found then return false; end if;
  if not exists (
    select 1 from public.transaction_attorney_assignments a
    where a.transaction_id = p_transaction_id
      and coalesce(a.attorney_firm_id, a.firm_id) = p_firm_id
      and coalesce(a.assignment_status, a.status) in ('pending', 'active', 'paused')
      and coalesce(a.status, 'active') <> 'removed'
  ) then return false; end if;
  if p_capability = 'manage' then return v_principal; end if;
  if p_capability = 'workflow' then
    if not v_worker then return false; end if;
    select exists (
      select 1 from public.transaction_attorney_assignments a
      where a.transaction_id = p_transaction_id
        and coalesce(a.attorney_firm_id, a.firm_id) = p_firm_id
        and coalesce(a.assignment_status, a.status) in ('pending', 'active')
        and coalesce(a.status, 'active') <> 'removed'
        and coalesce(a.can_update_workflow_lane, true)
    ) into v_assignment_workable;
    if not v_assignment_workable then return false; end if;
  end if;
  if v_principal then return true; end if;
  if not exists (
    select 1 from public.attorney_matter_team_members team
    where team.transaction_id = p_transaction_id and team.firm_id = p_firm_id
      and team.removed_at is null
  ) then return true; end if;
  return exists (
    select 1 from public.attorney_matter_team_members team
    where team.transaction_id = p_transaction_id and team.firm_id = p_firm_id
      and team.user_id = v_actor and team.removed_at is null
  );
end;
$$;

create or replace function public.bridge_can_mutate_attorney_lane(
  p_transaction_id uuid,
  p_attorney_role text,
  p_capability text default 'workflow'
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := lower(trim(coalesce(p_attorney_role, '')));
  v_capability text := lower(trim(coalesce(p_capability, 'workflow')));
begin
  if p_transaction_id is null or v_actor is null
    or v_role not in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney')
    or v_capability not in ('workflow', 'documents', 'internal_notes', 'shared_updates')
  then return false; end if;

  if exists (
    select 1 from public.transaction_attorney_assignments a
    where a.transaction_id = p_transaction_id
      and coalesce(a.assignment_status, a.status) in ('pending', 'active')
      and coalesce(a.status, 'active') <> 'removed'
      and case v_role
        when 'transfer_attorney' then a.attorney_role = 'transfer_attorney'
          or a.assignment_type in ('transfer', 'transfer_and_bond')
          or a.matter_type in ('transfer', 'transfer_and_bond')
        when 'bond_attorney' then a.attorney_role = 'bond_attorney'
          or a.assignment_type in ('bond', 'transfer_and_bond')
          or a.matter_type in ('bond', 'transfer_and_bond')
        else a.attorney_role = 'cancellation_attorney'
          or a.assignment_type in ('cancellation', 'bond_cancellation')
          or a.matter_type in ('cancellation', 'bond_cancellation') end
      and case v_capability
        when 'workflow' then coalesce(a.can_update_workflow_lane, true)
        when 'documents' then coalesce(a.can_manage_documents, true)
        when 'internal_notes' then coalesce(a.can_add_internal_notes, true)
        else coalesce(a.can_add_shared_updates, true) end
      and public.bridge_attorney_matter_team_access(p_transaction_id,
        coalesce(a.attorney_firm_id, a.firm_id), 'workflow')
  ) then return true; end if;

  -- Delegation still requires an accepted, active owner appointment.
  return exists (
    select 1 from public.attorney_lane_delegations d
    join public.transaction_attorney_assignments owner_assignment
      on owner_assignment.transaction_id = d.transaction_id
     and owner_assignment.attorney_role = d.attorney_role
     and coalesce(owner_assignment.attorney_firm_id, owner_assignment.firm_id) = d.responsible_firm_id
    where d.transaction_id = p_transaction_id and d.attorney_role = v_role
      and d.delegate_user_id = v_actor and d.status = 'active'
      and d.starts_at <= now() and d.expires_at > now()
      and v_capability = any(d.capabilities)
      and coalesce(owner_assignment.assignment_status, owner_assignment.status) = 'active'
      and case v_capability
        when 'workflow' then coalesce(owner_assignment.can_update_workflow_lane, true)
        when 'documents' then coalesce(owner_assignment.can_manage_documents, true)
        when 'internal_notes' then coalesce(owner_assignment.can_add_internal_notes, true)
        else coalesce(owner_assignment.can_add_shared_updates, true) end
  );
end;
$$;

-- The review RPC has an additional assignment-status check beyond the lane
-- capability helper. Keep its actor and firm checks while aligning that check.
do $align_review_status$
declare
  v_definition text := pg_get_functiondef('public.bridge_review_canonical_requirement(uuid,uuid,text,text,text,uuid)'::regprocedure);
  v_needle text := 'coalesce(assignment.assignment_status, assignment.status) = ''active''';
begin
  if (length(v_definition) - length(replace(v_definition, v_needle, ''))) / length(v_needle) <> 1 then
    raise exception 'Expected one attorney review status guard; refusing to change an unexpected function';
  end if;
  execute replace(v_definition, v_needle,
    'coalesce(assignment.assignment_status, assignment.status) in (''pending'', ''active'')');
end;
$align_review_status$;

notify pgrst, 'reload schema';
commit;
