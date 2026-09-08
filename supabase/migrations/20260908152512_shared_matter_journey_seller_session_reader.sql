begin;
-- Shared allowlisted projection; only the public, authorised wrappers may call it.
create or replace function journey_private.read_matter_journey(p_transaction_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  -- One stable statement snapshot for plan, task outcomes and refresh revision.
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
      coalesce(s.status,'not_started') status,source.revision
    from planned p cross join source
    left join journey_private.task_catalog c on c.lane_key=p.lane_key and c.step_key=p.step_key
    left join public.transaction_subprocesses l on l.transaction_id=source.id and l.process_type=p.lane_key
    left join public.transaction_subprocess_steps s on s.subprocess_id=l.id and s.step_key=p.step_key
  ), phases as (
    select lane_key,phase_key,phase_label,phase_order,
      jsonb_agg(jsonb_build_object('key',step_key,'label',label,'clientLabel',label,
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

create or replace function public.bridge_read_shared_matter_journey(p_transaction_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((
    (auth.uid() is not null and public.bridge_can_access_transaction_spine(p_transaction_id))
    or public.bridge_has_client_portal_token_transaction_access(p_transaction_id)
    or public.bridge_has_onboarding_token_transaction_access(p_transaction_id)
  ),false) then raise exception 'You do not have access to this matter journey.' using errcode='42501'; end if;
  return journey_private.read_matter_journey(p_transaction_id);
end;
$$;

create or replace function public.bridge_read_seller_shared_matter_journey(p_token text, p_access_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payload jsonb; v_listing_id uuid; v_transaction_id uuid;
begin
  if nullif(btrim(p_token),'') is null or nullif(btrim(p_access_token),'') is null then
    raise exception 'Seller portal access is required.' using errcode='42501';
  end if;
  -- Reuse the seller password/session gate. Never trust a browser-supplied
  -- transaction ID or an onboarding token without a valid portal session.
  v_payload := public.bridge_private_listing_seller_portal_payload(p_token,p_access_token,true);
  if v_payload is null or coalesce((v_payload ->> 'authRequired')::boolean,false) then
    raise exception 'Seller portal access is required.' using errcode='42501';
  end if;
  v_listing_id := nullif(v_payload #>> '{listing,id}','')::uuid;
  if v_listing_id is null then raise exception 'Seller portal access is required.' using errcode='42501'; end if;
  v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing_id);
  if v_transaction_id is null then return null; end if;
  return journey_private.read_matter_journey(v_transaction_id);
end;
$$;
revoke all on function public.bridge_read_shared_matter_journey(uuid) from public;
grant execute on function public.bridge_read_shared_matter_journey(uuid) to anon,authenticated;
revoke all on function public.bridge_read_seller_shared_matter_journey(text,text) from public;
grant execute on function public.bridge_read_seller_shared_matter_journey(text,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
