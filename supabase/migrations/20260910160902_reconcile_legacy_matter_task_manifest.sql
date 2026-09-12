begin;
-- Operator-only, per-matter reconciliation. Never rewrites historical outcomes.
create or replace function public.bridge_reconcile_legacy_task_manifest(
  p_transaction_id uuid, p_expected_profile jsonb, p_plan jsonb, p_review jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_profile jsonb; v_count integer;
begin
  select coalesce(routing_profile_json,'{}'::jsonb) into v_profile
    from public.transactions where id=p_transaction_id for update;
  if not found then raise exception 'Matter not found'; end if;
  if v_profile->'workflowPlan'=p_plan and v_profile ? 'legacyTaskReconciliation' then
    return jsonb_build_object('status','already_applied');
  end if;
  if v_profile is distinct from p_expected_profile then
    raise exception 'Matter profile changed; refresh reconciliation preview';
  end if;
  if p_plan->>'status' is distinct from 'active'
     or jsonb_typeof(p_plan->'lanes') is distinct from 'array'
     or jsonb_array_length(p_plan->'lanes')=0
     or jsonb_typeof(p_review) is distinct from 'array' then
    raise exception 'Invalid task manifest';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_plan->'lanes') l
    where l->>'laneKey' not in ('transfer','bond','cancellation')
      or jsonb_typeof(l->'stepKeys') is distinct from 'array'
      or jsonb_array_length(l->'stepKeys')=0
  ) then raise exception 'Invalid lane manifest'; end if;
  if (select count(*)<>count(distinct l->>'laneKey') from jsonb_array_elements(p_plan->'lanes') l)
    then raise exception 'Duplicate lane'; end if;
  -- Existing lanes must remain represented. No assignment or lane creation here.
  if exists (
    (select process_type from public.transaction_subprocesses where transaction_id=p_transaction_id
       and process_type in ('transfer','bond','cancellation')
     except select l->>'laneKey' from jsonb_array_elements(p_plan->'lanes') l)
    union all
    (select l->>'laneKey' from jsonb_array_elements(p_plan->'lanes') l
     except select process_type from public.transaction_subprocesses where transaction_id=p_transaction_id)
  ) then raise exception 'Lane set changed; reconcile assignments first'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_plan->'lanes') l
    cross join lateral jsonb_array_elements_text(l->'stepKeys') k
    left join journey_private.task_catalog c on c.lane_key=l->>'laneKey' and c.step_key=k.value
    where c.step_key is null
  ) or exists (
    select 1 from jsonb_array_elements(p_plan->'lanes') l,
      lateral jsonb_array_elements_text(l->'stepKeys') k
    group by l->>'laneKey',k.value having count(*)>1
  ) then raise exception 'Unknown or duplicate task'; end if;
  insert into public.transaction_subprocess_steps(subprocess_id,step_key,step_label,status,owner_type,sort_order)
    select s.id,k.value,c.definition #>> '{professional,title}','not_started','attorney',k.ordinality
    from jsonb_array_elements(p_plan->'lanes') l
    cross join lateral jsonb_array_elements_text(l->'stepKeys') with ordinality k(value,ordinality)
    join public.transaction_subprocesses s on s.transaction_id=p_transaction_id and s.process_type=l->>'laneKey'
    join journey_private.task_catalog c on c.lane_key=s.process_type and c.step_key=k.value
    on conflict(subprocess_id,step_key) do nothing;
  get diagnostics v_count = row_count;
  update public.transactions set routing_profile_json = v_profile || jsonb_build_object(
    'workflowPlan',p_plan,'legacyTaskReconciliation',jsonb_build_object(
      'version',1,'appliedAt',now(),'previousPlan',v_profile->'workflowPlan','review',p_review))
    where id=p_transaction_id;
  insert into public.transaction_refresh_signals(transaction_id,version,changed_at)
    values(p_transaction_id,1,now()) on conflict(transaction_id) do update
    set version=public.transaction_refresh_signals.version+1,changed_at=excluded.changed_at;
  return jsonb_build_object('status','applied','insertedTasks',v_count);
end $$;
revoke all on function public.bridge_reconcile_legacy_task_manifest(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.bridge_reconcile_legacy_task_manifest(uuid,jsonb,jsonb,jsonb) to service_role;
commit;
