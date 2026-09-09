begin;

-- A Bond Registration lane is relevant only where the canonical finance route
-- includes a bond component. Older workflow plans could retain a manually
-- included bond lane after a matter was captured as cash. Repair the active
-- plan without deleting the historical subprocess/audit rows.
with cash_or_unknown_plans as (
  select
    t.id,
    t.routing_profile_json,
    lower(coalesce(
      nullif(trim(t.finance_type), ''),
      nullif(trim(t.routing_profile_json ->> 'financeType'), ''),
      'unknown'
    )) as finance_type
  from public.transactions t
  where t.routing_profile_json -> 'workflowPlan' ->> 'status' = 'active'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(t.routing_profile_json #> '{workflowPlan,lanes}', '[]'::jsonb)) lane
      where lane ->> 'laneKey' = 'bond'
    )
), repaired as (
  update public.transactions t
  set routing_profile_json = jsonb_set(
        jsonb_set(
          jsonb_set(
            t.routing_profile_json,
            '{requiresBondAttorney}',
            'false'::jsonb,
            true
          ),
          '{workflowPlan,laneKeys}',
          coalesce((
            select jsonb_agg(lane_key order by lane_order)
            from jsonb_array_elements_text(coalesce(t.routing_profile_json #> '{workflowPlan,laneKeys}', '[]'::jsonb))
              with ordinality as lane_keys(lane_key, lane_order)
            where lane_key <> 'bond'
          ), '[]'::jsonb),
          true
        ),
        '{workflowPlan,lanes}',
        coalesce((
          select jsonb_agg(lane order by lane_order)
          from jsonb_array_elements(coalesce(t.routing_profile_json #> '{workflowPlan,lanes}', '[]'::jsonb))
            with ordinality as lanes(lane, lane_order)
          where lane ->> 'laneKey' <> 'bond'
        ), '[]'::jsonb),
        true
      ),
      updated_at = now()
  from cash_or_unknown_plans candidate
  where t.id = candidate.id
    and candidate.finance_type not in ('bond', 'hybrid', 'combination')
  returning t.id
)
insert into public.transaction_refresh_signals(transaction_id, version, changed_at)
select id, 1, now()
from repaired
on conflict (transaction_id) do update
  set version = public.transaction_refresh_signals.version + 1,
      changed_at = excluded.changed_at;

-- The shared journey reader remains defensive while a deployment rolls out or
-- if a legacy integration writes a stale plan. Every audience therefore sees
-- the same finance-conditioned lanes, even before the repair is observed.
create or replace function journey_private.read_matter_journey(p_transaction_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  with source as (
    select
      t.id,
      t.finance_type,
      t.routing_profile_json -> 'workflowPlan' plan,
      lower(coalesce(
        nullif(trim(t.finance_type), ''),
        nullif(trim(t.routing_profile_json ->> 'financeType'), ''),
        'unknown'
      )) in ('bond', 'hybrid', 'combination') as requires_bond_lane,
      coalesce(r.version, 0) revision
    from public.transactions t
    left join public.transaction_refresh_signals r on r.transaction_id = t.id
    where t.id = p_transaction_id
  ), planned as (
    select lp ->> 'laneKey' lane_key, k.step_key
    from source
    cross join lateral jsonb_array_elements(coalesce(plan -> 'lanes', '[]'::jsonb)) lp
    cross join lateral jsonb_array_elements_text(lp -> 'stepKeys') k(step_key)
    where plan ->> 'status' = 'active'
      and (lp ->> 'laneKey' <> 'bond' or source.requires_bond_lane)
    union all
    select l.process_type, s.step_key
    from source
    join public.transaction_subprocesses l on l.transaction_id = source.id
    join public.transaction_subprocess_steps s on s.subprocess_id = l.id
    where coalesce(plan ->> 'status', '') <> 'active'
      and l.process_type in ('transfer', 'bond', 'cancellation')
      and (l.process_type <> 'bond' or source.requires_bond_lane)
  ), tasks as (
    select
      p.lane_key, p.step_key, c.phase_key, c.phase_label, c.phase_order, c.task_order,
      c.definition #>> '{professional,title}' label,
      coalesce(s.status, 'not_started') status, source.revision
    from planned p
    cross join source
    left join journey_private.task_catalog c on c.lane_key = p.lane_key and c.step_key = p.step_key
    left join public.transaction_subprocesses l on l.transaction_id = source.id and l.process_type = p.lane_key
    left join public.transaction_subprocess_steps s on s.subprocess_id = l.id and s.step_key = p.step_key
  ), phases as (
    select
      lane_key, phase_key, phase_label, phase_order,
      jsonb_agg(jsonb_build_object(
        'key', step_key, 'label', label, 'clientLabel', label,
        'status', status, 'revision', revision
      ) order by task_order, step_key) tasks
    from tasks
    group by lane_key, phase_key, phase_label, phase_order
  ), lanes as (
    select
      lane_key,
      jsonb_agg(jsonb_build_object(
        'key', phase_key, 'label', phase_label, 'clientLabel', phase_label, 'tasks', tasks
      ) order by phase_order, phase_key) phases
    from phases
    group by lane_key
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'transactionId', source.id,
    'revision', source.revision,
    'planRevision', source.revision,
    'commercialFacts', jsonb_build_object(
      'version', 1,
      'revision', source.revision,
      'financeType', source.finance_type,
      'steps', coalesce((
        select jsonb_agg(jsonb_build_object(
          'workflowKey', s.workflow_key, 'key', s.step_key, 'status', s.status
        ) order by s.workflow_key, s.step_key)
        from public.transaction_workflow_steps s
        join public.transaction_workflow_instances i on i.id = s.workflow_instance_id
          and i.transaction_id = source.id and i.workflow_key = s.workflow_key
        where s.transaction_id = source.id and (
          (s.workflow_key = 'sales_otp' and s.step_key = 'signed_otp_received')
          or (s.workflow_key = 'finance_cash' and source.finance_type = 'cash'
            and s.step_key in ('proof_of_funds_reviewed', 'cash_confirmation_approved'))
          or (s.workflow_key = 'finance_bond' and source.finance_type = 'bond'
            and s.step_key in ('quote_approved', 'instruction_sent'))
          or (s.workflow_key = 'finance_hybrid' and source.finance_type = 'hybrid'
            and s.step_key in ('cash_portion_confirmed', 'quote_approved', 'instruction_sent'))
        )
      ), '[]'::jsonb)
    ),
    'planStatus', source.plan ->> 'status',
    'requiredLaneKeys', case when source.plan ->> 'status' = 'active' then (
      select coalesce(jsonb_agg(lp ->> 'laneKey'), '[]'::jsonb)
      from jsonb_array_elements(source.plan -> 'lanes') lp
      where lp ->> 'laneKey' <> 'bond' or source.requires_bond_lane
    ) else null end,
    'lanes', coalesce((
      select jsonb_agg(jsonb_build_object('key', lane_key, 'phases', phases)
        order by case lane_key when 'transfer' then 1 when 'bond' then 2 else 3 end)
      from lanes
    ), '[]'::jsonb),
    'invalidCatalog', exists(select 1 from tasks where phase_key is null)
  ) into v_result
  from source;

  if v_result is null then
    raise exception 'Matter not found.' using errcode = 'P0002';
  end if;
  if (v_result ->> 'invalidCatalog')::boolean then
    raise exception 'Matter plan requires reconciliation.' using errcode = '22023';
  end if;
  return v_result - 'invalidCatalog';
end;
$$;

revoke all on function journey_private.read_matter_journey(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
