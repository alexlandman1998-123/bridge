begin;

create or replace function public.bridge_recompute_matter_lifecycle_from_attorney_workflows(
  p_transaction_id uuid,
  p_actor_id uuid default null,
  p_trigger_stage text default null,
  p_trigger_status text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.transactions%rowtype;
  v_existing_stage text;
  v_stage text;
  v_trigger_rank integer;
  v_existing_rank integer;
  v_incomplete_in_trigger_stage boolean := false;
  v_now timestamptz := now();
begin
  select *
  into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    return null;
  end if;

  if lower(coalesce(v_transaction.lifecycle_state, '')) in ('registered', 'completed', 'archived', 'cancelled', 'canceled') then
    return coalesce(
      (select current_stage from public.transaction_lifecycle_workflows where transaction_id = p_transaction_id),
      'post_registration'
    );
  end if;

  select current_stage
  into v_existing_stage
  from public.transaction_lifecycle_workflows
  where transaction_id = p_transaction_id;

  -- Earliest outstanding applicable task, not the last button clicked.
  -- LEFT JOIN preserves planned tasks whose rows have not yet been seeded.
  with effective_tasks as (
    select lp ->> 'laneKey' as lane_key, k.step_key, coalesce(s.status, 'not_started') as status
    from jsonb_array_elements(coalesce(v_transaction.routing_profile_json -> 'workflowPlan' -> 'lanes', '[]'::jsonb)) lp
    cross join lateral jsonb_array_elements_text(lp -> 'stepKeys') k(step_key)
    left join public.transaction_subprocesses l on l.transaction_id = p_transaction_id and l.process_type = lp ->> 'laneKey'
    left join public.transaction_subprocess_steps s on s.subprocess_id = l.id and s.step_key = k.step_key
    where v_transaction.routing_profile_json -> 'workflowPlan' ->> 'status' = 'active'
    union all
    select l.process_type, s.step_key, coalesce(s.status, 'not_started')
    from public.transaction_subprocesses l
    join public.transaction_subprocess_steps s on s.subprocess_id = l.id
    where l.transaction_id = p_transaction_id and l.process_type in ('transfer', 'bond', 'cancellation')
      and coalesce(v_transaction.routing_profile_json -> 'workflowPlan' ->> 'status', '') <> 'active'
  )
  select public.bridge_attorney_step_to_matter_stage(lane_key, step_key) into v_stage
  from effective_tasks where status not in ('completed', 'not_required')
  order by public.bridge_matter_lifecycle_stage_rank(public.bridge_attorney_step_to_matter_stage(lane_key, step_key)), lane_key, step_key
  limit 1;
  v_stage := coalesce(v_stage, 'post_registration');

  insert into public.transaction_lifecycle_workflows (
    transaction_id,
    current_stage,
    status,
    last_updated_by,
    last_updated_at,
    updated_at
  ) values (
    p_transaction_id,
    v_stage,
    'active',
    p_actor_id,
    v_now,
    v_now
  )
  on conflict (transaction_id) do update set
    current_stage = excluded.current_stage,
    status = excluded.status,
    last_updated_by = excluded.last_updated_by,
    last_updated_at = excluded.last_updated_at,
    updated_at = excluded.updated_at;

  update public.transactions
  set
    current_main_stage = v_stage,
    current_sub_stage_summary = public.bridge_matter_lifecycle_stage_label(v_stage),
    updated_at = v_now
  where id = p_transaction_id
    and lower(coalesce(lifecycle_state, 'active')) not in ('registered', 'completed', 'archived', 'cancelled', 'canceled');

  return v_stage;
end;
$$;

create or replace function public.bridge_update_attorney_workflow_step_v2(
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
  v_matter_stage text;
  v_previous_lifecycle_stage text;
  v_next_lifecycle_stage text;
  v_plan_keys text[];
  v_has_plan boolean;
  v_total integer;
  v_completed integer;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_lane_key is null or p_lane_key not in ('transfer', 'bond', 'cancellation') then
    raise exception 'Invalid attorney workflow lane.' using errcode = '22023';
  end if;

  if p_status is null or p_status not in ('not_started', 'in_progress', 'waiting', 'blocked', 'completed') then
    raise exception 'Invalid attorney workflow step status.' using errcode = '22023';
  end if;

  if p_visibility is null or p_visibility not in ('internal', 'professional_shared', 'client_visible') then
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

  if not public.bridge_can_mutate_attorney_lane(p_transaction_id, v_attorney_role, 'workflow') then
    raise exception 'You do not have permission to update this attorney workflow lane.' using errcode = '42501';
  end if;

  -- Serialise all lane edits on the matter before taking lane/step locks.
  perform 1 from public.transactions where id = p_transaction_id for update;
  select routing_profile_json -> 'workflowPlan' ->> 'status' = 'active'
    into v_has_plan from public.transactions where id = p_transaction_id;
  select array_agg(task.key order by task.ordinality) into v_plan_keys
  from public.transactions t
  cross join lateral jsonb_array_elements(t.routing_profile_json -> 'workflowPlan' -> 'lanes') lp
  cross join lateral jsonb_array_elements_text(lp -> 'stepKeys') with ordinality task(key, ordinality)
  where t.id = p_transaction_id and lp ->> 'laneKey' = p_lane_key;

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

  if coalesce(v_has_plan, false) and not coalesce(v_step.step_key = any(v_plan_keys), false) then
    raise exception 'This task is not in the active matter plan. Refresh the workflow.' using errcode = '22023';
  end if;

  select current_stage
  into v_previous_lifecycle_stage
  from public.transaction_lifecycle_workflows
  where transaction_id = p_transaction_id;

  update public.transaction_subprocess_steps
  set
    status = p_status,
    comment = nullif(trim(coalesce(p_note, '')), ''),
    completed_at = case when p_status = 'completed' then v_now else null end,
    completed_by = case when p_status = 'completed' then v_actor_id else null end,
    visibility_scope = p_visibility,
    updated_at = v_now
  where id = v_step.id;

  -- The planned denominator includes missing rows; they are never completed.
  if not coalesce(v_has_plan, false) then
    select array_agg(step_key order by sort_order, step_key) into v_plan_keys
    from public.transaction_subprocess_steps where subprocess_id = v_lane.id;
  end if;
  select count(*), count(*) filter (where s.status = 'completed'),
    case when count(*) > 0 and bool_and(coalesce(s.status, 'not_started') = 'completed') then 'completed'
      when bool_or(s.status = 'blocked') then 'blocked'
      when bool_or(s.status in ('in_progress', 'waiting', 'completed')) then 'in_progress'
      else 'not_started' end
  into v_total, v_completed, v_lane_status
  from unnest(v_plan_keys) k(step_key)
  left join public.transaction_subprocess_steps s on s.subprocess_id = v_lane.id and s.step_key = k.step_key;

  select k.step_key into v_next_stage_key
  from unnest(v_plan_keys) with ordinality k(step_key, ordinal)
  left join public.transaction_subprocess_steps s on s.subprocess_id = v_lane.id and s.step_key = k.step_key
  where coalesce(s.status, 'not_started') <> 'completed'
  order by ordinal limit 1;

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

  v_matter_stage := public.bridge_attorney_step_to_matter_stage(p_lane_key, v_step.step_key);
  v_next_lifecycle_stage := public.bridge_recompute_matter_lifecycle_from_attorney_workflows(
    p_transaction_id,
    v_actor_id,
    v_matter_stage,
    p_status
  );

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
      'matterStage', v_next_lifecycle_stage,
      'previousMatterStage', v_previous_lifecycle_stage,
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
      'matterStage', v_next_lifecycle_stage,
      'previousMatterStage', v_previous_lifecycle_stage,
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
    'completionPercent', case when v_total > 0 then round(100.0 * v_completed / v_total) else 0 end,
    'laneStatus', v_lane_status,
    'currentStage', v_next_stage_key,
    'stepId', v_step.id,
    'stepKey', v_step.step_key,
    'stepStatus', p_status,
    'matterStage', v_next_lifecycle_stage,
    'previousMatterStage', v_previous_lifecycle_stage,
    'eventType', v_event_type,
    'updatedAt', v_now
  );
end;
$$;

-- This helper is internal; callers must use the lane-authorised atomic RPC.
revoke all on function public.bridge_recompute_matter_lifecycle_from_attorney_workflows(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.bridge_update_attorney_workflow_step_v2(uuid, text, uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.bridge_update_attorney_workflow_step_v2(uuid, text, uuid, text, text, text, jsonb) to authenticated;

commit;
