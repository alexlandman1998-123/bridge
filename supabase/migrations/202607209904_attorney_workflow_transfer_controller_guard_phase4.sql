begin;

create or replace function public.bridge_attorney_assignment_covers_workflow_lane(
  target_attorney_role text,
  target_assignment_type text,
  target_lane_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case lower(trim(coalesce(target_lane_key, '')))
    when 'transfer' then
      lower(trim(coalesce(target_attorney_role, ''))) = 'transfer_attorney'
      or lower(trim(coalesce(target_assignment_type, ''))) in ('transfer', 'transfer_and_bond')
    when 'bond' then
      lower(trim(coalesce(target_attorney_role, ''))) = 'bond_attorney'
      or lower(trim(coalesce(target_assignment_type, ''))) in ('bond', 'transfer_and_bond')
    when 'cancellation' then
      lower(trim(coalesce(target_attorney_role, ''))) = 'cancellation_attorney'
      or lower(trim(coalesce(target_assignment_type, ''))) = 'cancellation'
    else false
  end;
$$;

create or replace function public.bridge_attorney_member_can_edit_workflow_lane(
  target_firm_id uuid,
  target_user_id uuid,
  target_lane_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with required_lane as (
    select case lower(trim(coalesce(target_lane_key, '')))
      when 'bond' then 'bond'
      when 'cancellation' then 'cancellation'
      else 'transfer'
    end as lane_key
  )
  select exists (
    select 1
    from public.attorney_firm_members member
    cross join required_lane
    where member.firm_id = target_firm_id
      and member.user_id = target_user_id
      and member.status = 'active'
      and (
        public.bridge_normalize_attorney_professional_role(member.professional_role) in ('firm_admin', 'director_partner')
        or (
          public.bridge_normalize_attorney_professional_role(member.professional_role) = 'attorney_conveyancer'
          and (
            (
              required_lane.lane_key = 'bond'
              and 'bond' = any(public.bridge_normalize_attorney_practice_qualifications(null, member.practice_qualifications))
            )
            or (
              required_lane.lane_key = 'transfer'
              and 'transfer' = any(public.bridge_normalize_attorney_practice_qualifications(null, member.practice_qualifications))
            )
            or (
              required_lane.lane_key = 'cancellation'
              and (
                'cancellation' = any(public.bridge_normalize_attorney_practice_qualifications(null, member.practice_qualifications))
                or 'transfer' = any(public.bridge_normalize_attorney_practice_qualifications(null, member.practice_qualifications))
              )
            )
          )
        )
      )
  );
$$;

create or replace function public.bridge_resolve_attorney_workflow_lane_guard(
  p_transaction_id uuid,
  p_lane_key text,
  p_actor_id uuid default auth.uid()
)
returns table (
  can_update boolean,
  access_reason text,
  assignment_id uuid,
  firm_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lane_key text := lower(trim(coalesce(p_lane_key, '')));
  v_assignment record;
begin
  if p_actor_id is null or p_transaction_id is null then
    return query select false, 'missing_context'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_lane_key not in ('transfer', 'bond', 'cancellation') then
    return query select false, 'invalid_lane'::text, null::uuid, null::uuid;
    return;
  end if;

  select
    assignment.id,
    coalesce(assignment.attorney_firm_id, assignment.firm_id) as resolved_firm_id
  into v_assignment
  from public.transaction_attorney_assignments assignment
  where assignment.transaction_id = p_transaction_id
    and lower(coalesce(assignment.assignment_status, assignment.status, '')) = 'active'
    and assignment.is_primary is not false
    and assignment.can_update_workflow_lane is not false
    and public.bridge_attorney_assignment_covers_workflow_lane(
      assignment.attorney_role,
      assignment.assignment_type,
      v_lane_key
    )
    and (
      assignment.assigned_user_id = p_actor_id
      or assignment.attorney_user_id = p_actor_id
      or assignment.primary_attorney_id = p_actor_id
    )
    and public.bridge_attorney_member_can_edit_workflow_lane(
      coalesce(assignment.attorney_firm_id, assignment.firm_id),
      p_actor_id,
      v_lane_key
    )
  order by assignment.updated_at desc nulls last, assignment.assigned_at desc nulls last
  limit 1;

  if v_assignment.id is not null then
    return query select true, 'assigned_attorney'::text, v_assignment.id, v_assignment.resolved_firm_id;
    return;
  end if;

  if v_lane_key <> 'transfer' then
    select
      assignment.id,
      coalesce(assignment.attorney_firm_id, assignment.firm_id) as resolved_firm_id
    into v_assignment
    from public.transaction_attorney_assignments assignment
    where assignment.transaction_id = p_transaction_id
      and lower(coalesce(assignment.assignment_status, assignment.status, '')) = 'active'
      and assignment.is_primary is not false
      and assignment.can_update_workflow_lane is not false
      and public.bridge_attorney_assignment_covers_workflow_lane(
        assignment.attorney_role,
        assignment.assignment_type,
        'transfer'
      )
      and (
        assignment.attorney_user_id = p_actor_id
        or assignment.primary_attorney_id = p_actor_id
      )
      and public.bridge_attorney_member_can_edit_workflow_lane(
        coalesce(assignment.attorney_firm_id, assignment.firm_id),
        p_actor_id,
        'transfer'
      )
    order by assignment.updated_at desc nulls last, assignment.assigned_at desc nulls last
    limit 1;

    if v_assignment.id is not null then
      return query select true, 'transfer_attorney_controller'::text, v_assignment.id, v_assignment.resolved_firm_id;
      return;
    end if;
  end if;

  select
    assignment.id,
    coalesce(assignment.attorney_firm_id, assignment.firm_id) as resolved_firm_id
  into v_assignment
  from public.transaction_attorney_assignments assignment
  join public.attorney_firm_members member
    on member.firm_id = coalesce(assignment.attorney_firm_id, assignment.firm_id)
   and member.user_id = p_actor_id
   and member.status = 'active'
  join public.attorney_firms firm
    on firm.id = coalesce(assignment.attorney_firm_id, assignment.firm_id)
  where assignment.transaction_id = p_transaction_id
    and lower(coalesce(assignment.assignment_status, assignment.status, '')) = 'active'
    and assignment.is_primary is not false
    and assignment.can_update_workflow_lane is not false
    and public.bridge_attorney_assignment_covers_workflow_lane(
      assignment.attorney_role,
      assignment.assignment_type,
      v_lane_key
    )
    and firm.allow_management_lane_override = true
    and public.bridge_normalize_attorney_professional_role(member.professional_role) in ('firm_admin', 'director_partner')
  order by assignment.updated_at desc nulls last, assignment.assigned_at desc nulls last
  limit 1;

  if v_assignment.id is not null then
    return query select true, 'management_override'::text, v_assignment.id, v_assignment.resolved_firm_id;
    return;
  end if;

  return query select false, 'no_lane_authority'::text, null::uuid, null::uuid;
end;
$$;

create or replace function public.bridge_update_attorney_workflow_step(
  p_transaction_id uuid,
  p_lane_key text,
  p_step_id uuid,
  p_status text,
  p_note text default '',
  p_visibility text default 'internal',
  p_work_packet jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_lane public.transaction_subprocesses%rowtype;
  v_step public.transaction_subprocess_steps%rowtype;
  v_lane_status text;
  v_event_type text;
  v_now timestamptz := now();
  v_attorney_role text;
  v_guard record;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_lane_key not in ('transfer', 'bond', 'cancellation') then
    raise exception 'Invalid attorney workflow lane.' using errcode = '22023';
  end if;

  if p_status not in ('not_started', 'in_progress', 'waiting', 'blocked', 'completed') then
    raise exception 'Invalid attorney workflow step status.' using errcode = '22023';
  end if;

  if p_visibility not in ('internal', 'professional_shared', 'client_visible') then
    raise exception 'Invalid attorney workflow visibility.' using errcode = '22023';
  end if;

  v_attorney_role := p_lane_key || '_attorney';

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_actor_id
      and lower(coalesce(profile.role, '')) in ('attorney', 'conveyancer')
  ) then
    raise exception 'Only attorney workspace users may update legal workflow steps.' using errcode = '42501';
  end if;

  select *
  into v_guard
  from public.bridge_resolve_attorney_workflow_lane_guard(p_transaction_id, p_lane_key, v_actor_id)
  limit 1;

  if not coalesce(v_guard.can_update, false) then
    raise exception 'You do not have permission to update this attorney workflow.' using errcode = '42501';
  end if;

  select lane.*
  into v_lane
  from public.transaction_subprocesses lane
  where lane.transaction_id = p_transaction_id
    and lane.process_type = p_lane_key
  for update;

  if not found then
    raise exception 'This workflow lane is not required for this transaction.' using errcode = 'P0002';
  end if;

  select step.*
  into v_step
  from public.transaction_subprocess_steps step
  where step.id = p_step_id
    and step.subprocess_id = v_lane.id
  for update;

  if not found then
    raise exception 'Workflow step not found.' using errcode = 'P0002';
  end if;

  update public.transaction_subprocess_steps
  set
    status = p_status,
    comment = nullif(trim(coalesce(p_note, '')), ''),
    completed_at = case when p_status = 'completed' then v_now else null end,
    completed_by = case when p_status = 'completed' then v_actor_id else null end,
    visibility_scope = p_visibility,
    updated_at = v_now
  where id = v_step.id;

  select case
    when count(*) > 0 and bool_and(step.status = 'completed') then 'completed'
    when bool_or(step.status = 'blocked') then 'blocked'
    when bool_or(step.status in ('in_progress', 'waiting', 'completed')) then 'in_progress'
    else 'not_started'
  end
  into v_lane_status
  from public.transaction_subprocess_steps step
  where step.subprocess_id = v_lane.id;

  update public.transaction_subprocesses
  set
    current_stage = v_step.step_key,
    lane_status = v_lane_status,
    status = v_lane_status,
    completed_at = case when v_lane_status = 'completed' then v_now else null end,
    updated_by = v_actor_id,
    updated_at = v_now
  where id = v_lane.id;

  insert into public.transaction_attorney_lane_history (
    transaction_id,
    subprocess_id,
    lane_key,
    attorney_role,
    previous_stage,
    new_stage,
    previous_status,
    new_status,
    changed_by,
    note,
    visibility,
    source,
    metadata
  ) values (
    p_transaction_id,
    v_lane.id,
    p_lane_key,
    v_attorney_role,
    v_lane.current_stage,
    v_step.step_key,
    v_step.status,
    p_status,
    v_actor_id,
    nullif(trim(coalesce(p_note, '')), ''),
    p_visibility,
    'attorney_workspace_step_atomic',
    jsonb_strip_nulls(jsonb_build_object(
      'stepId', v_step.id,
      'stepLabel', v_step.step_label,
      'permissionReason', v_guard.access_reason,
      'authorizingAssignmentId', v_guard.assignment_id,
      'authorizingFirmId', v_guard.firm_id,
      'workPacket', p_work_packet
    ))
  );

  v_event_type := case p_status
    when 'blocked' then 'AttorneyWorkflowStepBlocked'
    when 'waiting' then 'AttorneyWorkflowStepWaiting'
    when 'completed' then 'AttorneyWorkflowStepCompleted'
    else 'AttorneyWorkflowStepUpdated'
  end;

  insert into public.transaction_events (
    transaction_id,
    event_type,
    event_data,
    created_by,
    created_by_role,
    visibility_scope
  ) values (
    p_transaction_id,
    v_event_type,
    jsonb_strip_nulls(jsonb_build_object(
      'laneKey', p_lane_key,
      'attorneyRole', v_attorney_role,
      'stepId', v_step.id,
      'stepKey', v_step.step_key,
      'stepLabel', v_step.step_label,
      'status', p_status,
      'permissionReason', v_guard.access_reason,
      'authorizingAssignmentId', v_guard.assignment_id,
      'authorizingFirmId', v_guard.firm_id,
      'note', nullif(trim(coalesce(p_note, '')), ''),
      'workPacket', p_work_packet
    )),
    v_actor_id,
    'attorney',
    p_visibility
  );

  return jsonb_build_object(
    'transactionId', p_transaction_id,
    'laneId', v_lane.id,
    'laneStatus', v_lane_status,
    'stepId', v_step.id,
    'stepKey', v_step.step_key,
    'stepStatus', p_status,
    'eventType', v_event_type,
    'permissionReason', v_guard.access_reason,
    'authorizingAssignmentId', v_guard.assignment_id,
    'updatedAt', v_now
  );
end;
$$;

revoke all on function public.bridge_attorney_assignment_covers_workflow_lane(text, text, text) from public, anon;
revoke all on function public.bridge_attorney_member_can_edit_workflow_lane(uuid, uuid, text) from public, anon;
revoke all on function public.bridge_resolve_attorney_workflow_lane_guard(uuid, text, uuid) from public, anon;
revoke all on function public.bridge_update_attorney_workflow_step(uuid, text, uuid, text, text, text, jsonb) from public;

grant execute on function public.bridge_attorney_assignment_covers_workflow_lane(text, text, text) to authenticated;
grant execute on function public.bridge_attorney_member_can_edit_workflow_lane(uuid, uuid, text) to authenticated;
grant execute on function public.bridge_resolve_attorney_workflow_lane_guard(uuid, text, uuid) to authenticated;
grant execute on function public.bridge_update_attorney_workflow_step(uuid, text, uuid, text, text, text, jsonb) to authenticated;

comment on function public.bridge_attorney_assignment_covers_workflow_lane(text, text, text) is
  'Resolves whether a transaction attorney assignment maps to a transfer, bond, or cancellation workflow lane.';
comment on function public.bridge_attorney_member_can_edit_workflow_lane(uuid, uuid, text) is
  'Checks canonical attorney professional role and practice qualification for workflow lane editing.';
comment on function public.bridge_resolve_attorney_workflow_lane_guard(uuid, text, uuid) is
  'Authorizes attorney workflow lane updates using direct lane assignment, primary transfer-attorney controller authority, or enabled management override.';
comment on function public.bridge_update_attorney_workflow_step(uuid, text, uuid, text, text, text, jsonb) is
  'Atomically updates an attorney workflow step after resolving direct, transfer-controller, or management-override lane authority.';

commit;
