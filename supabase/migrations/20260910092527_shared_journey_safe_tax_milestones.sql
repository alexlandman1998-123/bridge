begin;

-- Phase 6: the shared journey is a recipient-safe projection. Internal tax
-- reasoning (SARS queries, VAT basis, non-resident review, payment detail)
-- must never be copied into buyer or seller labels. Only the completed
-- clearance milestone is client-visible.
update journey_private.task_catalog
set definition = jsonb_set(
  jsonb_set(
    definition,
    '{clientVisibleAllowed}',
    to_jsonb(step_key = 'sars_transfer_tax_receipt_verified'),
    true
  ),
  '{client}',
  case step_key
    when 'sars_transfer_tax_receipt_verified' then jsonb_build_object(
      'title', 'Transfer tax clearance',
      'description', 'The applicable transfer-tax clearance has been verified.'
    )
    else jsonb_build_object()
  end,
  true
)
where lane_key = 'transfer'
  and step_key in (
    'transfer_tax_route_confirmed',
    'transfer_duty_tdc01_submission',
    'sars_evidence_request_response',
    'transfer_duty_assessment_payment',
    'vat_exemption_evidence_verified',
    'non_resident_seller_withholding_review',
    'sars_transfer_tax_receipt_verified'
  );

-- Preserve a stable, client-safe label for every portal journey task. The
-- source task label remains available to authorised professionals only.
create or replace function journey_private.read_matter_journey(p_transaction_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  with source as (
    select t.id, t.routing_profile_json -> 'workflowPlan' plan,
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
        when coalesce((c.definition ->> 'clientVisibleAllowed')::boolean, false)
          then coalesce(nullif(c.definition #>> '{client,title}',''), nullif(c.definition #>> '{professional,title}',''), 'Matter update')
        when p.lane_key = 'bond' then 'Bond registration progress'
        when p.lane_key = 'cancellation' then 'Bond cancellation progress'
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
notify pgrst,'reload schema';
commit;
