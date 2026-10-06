begin;

-- An instructed matter team may operate all three legal workflows. Assignment
-- rows retain responsibility and document/comment capabilities; they no longer
-- require duplicate appointments merely to save task answers and outcomes.
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

  if v_capability = 'workflow' and exists (
    select 1 from public.transaction_attorney_assignments a
    join public.profiles actor on actor.id = v_actor
      and lower(trim(coalesce(actor.role, ''))) in ('attorney', 'conveyancer')
    where a.transaction_id = p_transaction_id
      and coalesce(a.assignment_status, a.status) in ('pending', 'active')
      and coalesce(a.status, 'active') not in ('removed', 'revoked', 'inactive', 'suspended', 'paused')
      and coalesce(a.can_update_workflow_lane, true)
      and public.bridge_attorney_matter_team_access(p_transaction_id,
        coalesce(a.attorney_firm_id, a.firm_id), 'workflow')
      -- An explicit restriction on this firm's target lane takes precedence
      -- over the shared matter entitlement. Withdrawn assignments do not.
      and not exists (
        select 1 from public.transaction_attorney_assignments target
        where target.transaction_id = p_transaction_id
          and coalesce(target.attorney_firm_id, target.firm_id) = coalesce(a.attorney_firm_id, a.firm_id)
          and coalesce(target.assignment_status, target.status) in ('pending', 'active', 'paused')
          and coalesce(target.status, 'active') not in ('removed', 'revoked', 'inactive', 'suspended')
          and case v_role
            when 'transfer_attorney' then target.attorney_role = 'transfer_attorney'
              or target.assignment_type in ('transfer', 'transfer_and_bond')
              or target.matter_type in ('transfer', 'transfer_and_bond')
            when 'bond_attorney' then target.attorney_role = 'bond_attorney'
              or target.assignment_type in ('bond', 'transfer_and_bond')
              or target.matter_type in ('bond', 'transfer_and_bond')
            else target.attorney_role = 'cancellation_attorney'
              or target.assignment_type in ('cancellation', 'bond_cancellation')
              or target.matter_type in ('cancellation', 'bond_cancellation') end
          and (coalesce(target.assignment_status, target.status) = 'paused'
            or target.status = 'paused'
            or target.can_update_workflow_lane = false)
      )
  ) then return true; end if;

  -- Existing lane-specific document/comment grants and delegations are retained.
  if exists (
    select 1 from public.transaction_attorney_assignments a
    where a.transaction_id = p_transaction_id
      and v_capability <> 'workflow'
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
revoke all on function public.bridge_can_mutate_attorney_lane(uuid, text, text) from public, anon;
grant execute on function public.bridge_can_mutate_attorney_lane(uuid, text, text) to authenticated;

-- Answers saved through the atomic workflow command must reload in every lane
-- the same authenticated actor may edit. Existing read-only policies remain.
create policy attorney_task_confirmations_workflow_team_read
on public.attorney_task_confirmations
for select to authenticated
using (
  exists (
    select 1 from public.transaction_subprocesses lane
    where lane.id = attorney_task_confirmations.subprocess_id
      and lane.process_type in ('attorney', 'transfer', 'bond', 'cancellation')
      and public.bridge_can_mutate_attorney_lane(lane.transaction_id,
        case lane.process_type when 'attorney' then 'transfer_attorney'
          else lane.process_type || '_attorney' end, 'workflow')
  )
);

-- Atomic task saves carry an audit note. The workflow grant already authorises
-- that save; only deliberate client publication needs an additional capability.
do $align_workflow_audit$
declare
  v_definition text := pg_get_functiondef('public.bridge_update_attorney_workflow_step_v4(uuid,text,uuid,text,uuid,timestamptz,text,text,jsonb)'::regprocedure);
  v_needle text := $guard$if not public.bridge_can_mutate_attorney_lane(p_transaction_id, p_lane_key || '_attorney',
    case when p_visibility = 'internal' then 'internal_notes' else 'shared_updates' end)
  then raise exception 'You do not have permission to publish this update.' using errcode = '42501'; end if;$guard$;
begin
  if (length(v_definition) - length(replace(v_definition, v_needle, ''))) / length(v_needle) <> 1 then
    raise exception 'Expected one workflow audit permission guard; refusing to change an unexpected function';
  end if;
  execute replace(v_definition, v_needle,
    $guard$if p_visibility = 'client_visible' and not public.bridge_can_mutate_attorney_lane(
    p_transaction_id, p_lane_key || '_attorney', 'shared_updates')
  then raise exception 'You do not have permission to publish this update.' using errcode = '42501'; end if;$guard$);
end;
$align_workflow_audit$;

notify pgrst, 'reload schema';
commit;
