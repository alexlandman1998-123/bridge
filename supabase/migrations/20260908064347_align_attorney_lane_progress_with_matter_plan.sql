begin;

create or replace function public.bridge_reconcile_attorney_lane_progress_with_matter_plan(
  p_transaction_id uuid,
  p_lane_key text,
  p_step_key text,
  p_step_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_lane public.transaction_subprocesses%rowtype;
  v_plan_step_keys text[];
  v_total_steps integer := 0;
  v_completed_steps integer := 0;
  v_blocked_steps integer := 0;
  v_active_steps integer := 0;
  v_lane_status text := 'not_started';
  v_current_stage text;
  v_matter_stage text;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_lane_key not in ('transfer', 'bond', 'cancellation') then
    raise exception 'Invalid attorney workflow lane.' using errcode = '22023';
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
          select 1 from public.attorney_firm_members member
          where member.user_id = v_actor_id
            and member.status = 'active'
            and member.firm_id = coalesce(assignment.attorney_firm_id, assignment.firm_id)
        )
      )
  ) then
    raise exception 'You do not have permission to update this attorney workflow.' using errcode = '42501';
  end if;

  select lane.* into v_lane
  from public.transaction_subprocesses lane
  where lane.transaction_id = p_transaction_id
    and lane.process_type = p_lane_key
  for update;
  if not found then
    raise exception 'This workflow lane is not required for this transaction.' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(plan_step.step_key), array[]::text[])
  into v_plan_step_keys
  from public.transactions transaction_row
  cross join lateral jsonb_array_elements(coalesce(transaction_row.routing_profile_json -> 'workflowPlan' -> 'lanes', '[]'::jsonb)) lane_plan
  cross join lateral jsonb_array_elements_text(coalesce(lane_plan -> 'stepKeys', '[]'::jsonb)) plan_step(step_key)
  where transaction_row.id = p_transaction_id
    and transaction_row.routing_profile_json -> 'workflowPlan' ->> 'status' = 'active'
    and lane_plan ->> 'laneKey' = p_lane_key;

  if coalesce(array_length(v_plan_step_keys, 1), 0) = 0 then
    return jsonb_build_object('reconciled', false, 'reason', 'no_active_matter_plan');
  end if;

  select
    count(*)::integer,
    count(*) filter (where step.status = 'completed')::integer,
    count(*) filter (where step.status = 'blocked')::integer,
    count(*) filter (where step.status in ('in_progress', 'waiting', 'completed'))::integer
  into v_total_steps, v_completed_steps, v_blocked_steps, v_active_steps
  from public.transaction_subprocess_steps step
  where step.subprocess_id = v_lane.id
    and step.step_key = any(v_plan_step_keys);

  if v_total_steps = 0 then
    return jsonb_build_object('reconciled', false, 'reason', 'plan_steps_not_seeded');
  end if;

  v_lane_status := case
    when v_completed_steps = v_total_steps then 'completed'
    when v_blocked_steps > 0 then 'blocked'
    when v_active_steps > 0 then 'in_progress'
    else 'not_started'
  end;
  select step.step_key into v_current_stage
  from public.transaction_subprocess_steps step
  where step.subprocess_id = v_lane.id
    and step.step_key = any(v_plan_step_keys)
    and step.status <> 'completed'
  order by step.sort_order asc nulls last, step.created_at asc nulls last
  limit 1;
  v_current_stage := coalesce(v_current_stage, p_step_key);

  update public.transaction_subprocesses
  set current_stage = v_current_stage,
      lane_status = v_lane_status,
      status = v_lane_status,
      completed_at = case when v_lane_status = 'completed' then now() else null end,
      updated_by = v_actor_id,
      updated_at = now()
  where id = v_lane.id;

  v_matter_stage := public.bridge_recompute_matter_lifecycle_from_attorney_workflows(
    p_transaction_id, v_actor_id, public.bridge_attorney_step_to_matter_stage(p_lane_key, p_step_key), p_step_status
  );

  return jsonb_build_object(
    'reconciled', true,
    'laneStatus', v_lane_status,
    'currentStage', v_current_stage,
    'completionPercent', round((v_completed_steps::numeric / v_total_steps::numeric) * 100),
    'matterStage', v_matter_stage
  );
end;
$$;

revoke all on function public.bridge_reconcile_attorney_lane_progress_with_matter_plan(uuid, text, text, text) from public;
grant execute on function public.bridge_reconcile_attorney_lane_progress_with_matter_plan(uuid, text, text, text) to authenticated;

comment on function public.bridge_reconcile_attorney_lane_progress_with_matter_plan(uuid, text, text, text) is
  'Recalculates attorney lane and canonical matter lifecycle from the active confirmed matter workflow plan.';

commit;
