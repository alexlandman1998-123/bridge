begin;
-- Forward reconciliation: preserve commercial facts and active-plan metadata
-- while applying recipient-safe task labels. No saved outcomes are changed.
create or replace function journey_private.read_matter_journey(p_transaction_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  -- One stable statement snapshot for plan, task outcomes and refresh revision.
  with source as (
    select t.id, t.finance_type, t.routing_profile_json -> 'workflowPlan' plan,
      coalesce(r.version,0) revision
    from public.transactions t left join public.transaction_refresh_signals r on r.transaction_id=t.id
    where t.id=p_transaction_id
  ), planned as (
    select lp ->> 'laneKey' lane_key,k.step_key
    from source
    cross join lateral jsonb_array_elements(coalesce(plan -> 'lanes','[]'::jsonb)) lp
    cross join lateral jsonb_array_elements_text(lp -> 'stepKeys') k(step_key)
    where plan ->> 'status'='active'
    union all
    select l.process_type,s.step_key from source
    join public.transaction_subprocesses l on l.transaction_id=source.id
    join public.transaction_subprocess_steps s on s.subprocess_id=l.id
    where coalesce(plan ->> 'status','')<>'active' and l.process_type in ('transfer','bond','cancellation')
  ), tasks as (
    select p.lane_key,p.step_key,c.phase_key,c.phase_label,c.phase_order,c.task_order,
      c.definition #>> '{professional,title}' label,
      case
        when coalesce((c.definition ->> 'clientVisibleAllowed')::boolean,false)
          then coalesce(nullif(c.definition #>> '{client,title}',''),'Matter update')
        when p.lane_key='bond' then 'Bond registration progress'
        when p.lane_key='cancellation' then 'Bond cancellation progress'
        else 'Transfer progress'
      end client_label,
      coalesce(s.status,'not_started') status,source.revision
    from planned p cross join source
    left join journey_private.task_catalog c on c.lane_key=p.lane_key and c.step_key=p.step_key
    left join public.transaction_subprocesses l on l.transaction_id=source.id and l.process_type=p.lane_key
    left join public.transaction_subprocess_steps s on s.subprocess_id=l.id and s.step_key=p.step_key
  ), phases as (
    select lane_key,phase_key,phase_label,phase_order,
      jsonb_agg(jsonb_build_object('key',step_key,'label',label,'clientLabel',client_label,
        'status',status,'revision',revision) order by task_order,step_key) tasks
    from tasks group by lane_key,phase_key,phase_label,phase_order
  ), lanes as (
    select lane_key,jsonb_agg(jsonb_build_object('key',phase_key,'label',phase_label,
      'clientLabel',phase_label,'tasks',tasks) order by phase_order,phase_key) phases
    from phases group by lane_key
  )
  select jsonb_build_object('schemaVersion',1,'transactionId',source.id,'revision',source.revision,
    'planRevision',source.revision,
    'commercialFacts',jsonb_build_object('version',1,'revision',source.revision,
      'financeType',source.finance_type,
      'steps',coalesce((select jsonb_agg(jsonb_build_object(
        'workflowKey',s.workflow_key,'key',s.step_key,'status',s.status)
        order by s.workflow_key,s.step_key)
      from public.transaction_workflow_steps s
      join public.transaction_workflow_instances i on i.id=s.workflow_instance_id
        and i.transaction_id=source.id and i.workflow_key=s.workflow_key
      where s.transaction_id=source.id and (
        (s.workflow_key='sales_otp' and s.step_key='signed_otp_received')
        or (s.workflow_key='finance_cash' and source.finance_type='cash'
          and s.step_key in ('proof_of_funds_reviewed','cash_confirmation_approved'))
        or (s.workflow_key='finance_bond' and source.finance_type='bond'
          and s.step_key in ('quote_approved','instruction_sent'))
        or (s.workflow_key='finance_hybrid' and source.finance_type='hybrid'
          and s.step_key in ('cash_portion_confirmed','quote_approved','instruction_sent'))
      )),'[]'::jsonb)),
    'planStatus',source.plan ->> 'status',
    'requiredLaneKeys',case when source.plan ->> 'status'='active' then
      (select coalesce(jsonb_agg(lp ->> 'laneKey'),'[]'::jsonb)
       from jsonb_array_elements(source.plan -> 'lanes') lp)
      else null end,
    'lanes',coalesce((select jsonb_agg(jsonb_build_object('key',lane_key,'phases',phases)
      order by case lane_key when 'transfer' then 1 when 'bond' then 2 else 3 end) from lanes),'[]'::jsonb),
    'invalidCatalog',exists(select 1 from tasks where phase_key is null))
  into v_result from source;
  if v_result is null then raise exception 'Matter not found.' using errcode='P0002'; end if;
  if (v_result ->> 'invalidCatalog')::boolean then
    raise exception 'Matter plan requires reconciliation.' using errcode='22023';
  end if;
  return v_result - 'invalidCatalog';
end;
$$;
revoke all on function journey_private.read_matter_journey(uuid) from public,anon,authenticated;
-- Default privileges may grant anon directly; revoking PUBLIC alone is insufficient.
revoke all on function public.bridge_read_professional_matter_journey(uuid) from public,anon;
grant execute on function public.bridge_read_professional_matter_journey(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
