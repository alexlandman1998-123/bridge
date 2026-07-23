begin;

-- Keep the live attorney workflow pointer aligned with the step-level status.
-- The left workflow reads current_stage as the active focus, so completing a step
-- must advance that pointer instead of leaving it on the completed row.

alter table if exists public.transaction_subprocess_steps
  drop constraint if exists transaction_subprocess_steps_status_check;

alter table if exists public.transaction_subprocess_steps
  add constraint transaction_subprocess_steps_status_check
  check (status in ('not_started', 'in_progress', 'completed', 'blocked', 'waiting'));

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
  v_next_stage_key text;
  v_event_type text;
  v_now timestamptz := now();
  v_attorney_role text;
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

  if not exists (
    select 1
    from public.transaction_attorney_assignments assignment
    where assignment.transaction_id = p_transaction_id
      and lower(coalesce(assignment.assignment_status, assignment.status, 'active')) <> 'removed'
      and (
        assignment.assigned_user_id = v_actor_id
        or assignment.attorney_user_id = v_actor_id
        or assignment.primary_attorney_id = v_actor_id
        or assignment.secretary_id = v_actor_id
        or assignment.admin_handler_id = v_actor_id
        or exists (
          select 1
          from public.attorney_firm_members member
          where member.user_id = v_actor_id
            and member.status = 'active'
            and member.firm_id = coalesce(assignment.attorney_firm_id, assignment.firm_id)
        )
      )
  ) then
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

  if v_lane_status = 'completed' then
    select step.step_key
    into v_next_stage_key
    from public.transaction_subprocess_steps step
    where step.subprocess_id = v_lane.id
    order by step.sort_order desc nulls last, step.created_at desc nulls last, step.step_key desc
    limit 1;
  elsif p_status in ('blocked', 'waiting', 'in_progress') then
    v_next_stage_key := v_step.step_key;
  else
    select step.step_key
    into v_next_stage_key
    from public.transaction_subprocess_steps step
    where step.subprocess_id = v_lane.id
      and step.status <> 'completed'
    order by step.sort_order asc nulls last, step.created_at asc nulls last, step.step_key asc
    limit 1;
  end if;

  v_next_stage_key := coalesce(v_next_stage_key, v_step.step_key);

  update public.transaction_subprocesses
  set
    current_stage = v_next_stage_key,
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
    v_next_stage_key,
    v_step.status,
    p_status,
    v_actor_id,
    nullif(trim(coalesce(p_note, '')), ''),
    p_visibility,
    'attorney_workspace_step_atomic',
    jsonb_strip_nulls(jsonb_build_object(
      'stepId', v_step.id,
      'stepKey', v_step.step_key,
      'stepLabel', v_step.step_label,
      'currentStage', v_next_stage_key,
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
      'currentStage', v_next_stage_key,
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
    'currentStage', v_next_stage_key,
    'stepId', v_step.id,
    'stepKey', v_step.step_key,
    'stepStatus', p_status,
    'eventType', v_event_type,
    'updatedAt', v_now
  );
end;
$$;

revoke all on function public.bridge_update_attorney_workflow_step(uuid, text, uuid, text, text, text, jsonb) from public;
grant execute on function public.bridge_update_attorney_workflow_step(uuid, text, uuid, text, text, text, jsonb) to authenticated;

comment on function public.bridge_update_attorney_workflow_step(uuid, text, uuid, text, text, text, jsonb) is
  'Atomically updates an attorney workflow step, advances the lane focus, writes lane history, and emits a transaction audit event.';

commit;
