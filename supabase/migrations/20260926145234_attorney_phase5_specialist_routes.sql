begin;

insert into journey_private.task_catalog (lane_key,step_key,definition,phase_key,phase_label,phase_order,task_order)
select 'transfer', entry.step_key,
  pg_catalog.jsonb_build_object('processKey','transfer','processLabel','Property transfer',
    'stepKey',entry.step_key,'ownerRole','transfer_attorney','defaultVisibility','internal',
    'clientVisibleAllowed',false,'professional',pg_catalog.jsonb_build_object(
      'title',entry.title,'description',entry.description)),
  'fica_authority','FICA & Authority',1,entry.task_order
from (values
  ('specialist_classification_review','Classify Specialist Routes','Record the specialist decision, owner, instrument and evidence.',5),
  ('estate_authority_transfer_review','Review Estate Authority and Transfer','Verify estate authority and the transfer path.',6),
  ('insolvency_authority_transfer_review','Review Insolvency Authority and Transfer','Verify trustee or liquidator authority and the transfer path.',7),
  ('court_order_transfer_review','Review Court Order or Divorce Transfer','Verify the order and transfer instrument.',8),
  ('unusual_title_resolution_review','Resolve Unusual Title Conditions','Verify restrictions, consents and instrument.',9),
  ('agricultural_consent_review','Review Agricultural Land Consent','Verify consent or statutory exception.',10),
  ('share_block_instrument_review','Review Share Block Instrument','Verify the instrument and ordinary deeds applicability.',11),
  ('other_specialist_execution_review','Review Other Specialist Route','Verify the exceptional route and evidence.',12)
) entry(step_key,title,description,task_order)
on conflict (lane_key,step_key) do update set
  definition=excluded.definition,phase_key=excluded.phase_key,phase_label=excluded.phase_label,
  phase_order=excluded.phase_order,task_order=excluded.task_order;

create function journey_private.phase5_required_routes(p_profile jsonb)
returns text[] language plpgsql stable set search_path = '' as $$
declare v_keys text[] := array[]::text[]; v_party jsonb; v_route record;
begin
  for v_party in select value from pg_catalog.jsonb_array_elements(
    coalesce(p_profile #> '{scenarioProfile,parties}','[]'::jsonb)) loop
    if v_party ->> 'entityType'='estate' then v_keys := pg_catalog.array_append(v_keys,'deceased_estate'); end if;
    if v_party ->> 'entityType'='insolvency' then v_keys := pg_catalog.array_append(v_keys,'insolvency'); end if;
    if v_party ->> 'entityType' in ('unknown','other') or
      (v_party ->> 'entityType'='individual' and v_party ->> 'maritalRegime'='other') then
      v_keys := pg_catalog.array_append(v_keys,'other_exception'); end if;
  end loop;
  if exists (select 1 from pg_catalog.jsonb_array_elements_text(
    coalesce(p_profile #> '{scenarioProfile,exceptions}','[]'::jsonb)) e(value)
    where nullif(pg_catalog.btrim(e.value),'') is not null) then
    v_keys := pg_catalog.array_append(v_keys,'other_exception');
  end if;
  if p_profile ->> 'propertyTenure'='share_block' then v_keys := pg_catalog.array_append(v_keys,'share_block'); end if;
  for v_route in select key,value from pg_catalog.jsonb_each(
    coalesce(p_profile #> '{scenarioProfile,specialistRoutes}','{}'::jsonb)) loop
    if v_route.value ->> 'active'='true' and v_route.key=any(array[
      'deceased_estate','insolvency','court_order_divorce','unusual_title',
      'agricultural_land','share_block','other_exception']) then
      v_keys := pg_catalog.array_append(v_keys,v_route.key);
    end if;
  end loop;
  return array(select distinct key from pg_catalog.unnest(v_keys) key order by key);
end; $$;

create function journey_private.phase5_route_facts(p_profile jsonb)
returns jsonb language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'propertyTenure',coalesce(p_profile ->> 'propertyTenure',''),
    'propertyConditions',coalesce(p_profile #> '{mvpProfile,propertyConditions}','{}'::jsonb),
    'parties',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',p.value -> 'id','role',p.value -> 'role','name',p.value -> 'name',
      'entityType',p.value -> 'entityType','maritalRegime',p.value -> 'maritalRegime',
      'identityRoute',p.value -> 'identityRoute','taxResidence',p.value -> 'taxResidence',
      'ownershipShare',p.value -> 'ownershipShare',
      'representatives',coalesce(p.value -> 'representatives','[]'::jsonb)) order by p.value ->> 'id')
      from pg_catalog.jsonb_array_elements(coalesce(p_profile #> '{scenarioProfile,parties}','[]'::jsonb)) p(value)),'[]'::jsonb),
    'exceptions',coalesce((select pg_catalog.jsonb_agg(e.value order by e.value)
      from pg_catalog.jsonb_array_elements_text(coalesce(p_profile #> '{scenarioProfile,exceptions}','[]'::jsonb)) e(value)),'[]'::jsonb),
    'activeRoutes',coalesce((select pg_catalog.jsonb_agg(r.key order by r.key)
      from pg_catalog.jsonb_each(coalesce(p_profile #> '{scenarioProfile,specialistRoutes}','{}'::jsonb)) r(key,value)
      where r.value ->> 'active'='true'),'[]'::jsonb));
$$;

create function journey_private.phase5_route_task(p_key text)
returns text language sql immutable set search_path = '' as $$
  select case p_key
    when 'deceased_estate' then 'estate_authority_transfer_review'
    when 'insolvency' then 'insolvency_authority_transfer_review'
    when 'court_order_divorce' then 'court_order_transfer_review'
    when 'unusual_title' then 'unusual_title_resolution_review'
    when 'agricultural_land' then 'agricultural_consent_review'
    when 'share_block' then 'share_block_instrument_review'
    when 'other_exception' then 'other_specialist_execution_review'
  end;
$$;

create function journey_private.phase5_assert_routes(p_transaction_id uuid,p_lane_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_profile jsonb; v_key text; v_route jsonb; v_task text; v_status text; v_facts jsonb;
begin
  select routing_profile_json into v_profile from public.transactions where id=p_transaction_id;
  v_facts := journey_private.phase5_route_facts(v_profile);
  for v_key in select pg_catalog.unnest(journey_private.phase5_required_routes(v_profile)) loop
    v_route := v_profile #> array['scenarioProfile','specialistRoutes',v_key];
    if v_route ->> 'status' is distinct from 'confirmed' or
      (p_lane_id is not null and v_route ->> 'instrument' is distinct from 'deeds_transfer') or
      nullif(pg_catalog.btrim(coalesce(v_route ->> 'owner','')),'') is null or
      nullif(pg_catalog.btrim(coalesce(v_route ->> 'reason','')),'') is null or
      nullif(pg_catalog.btrim(coalesce(v_route ->> 'evidenceReference','')),'') is null or
      nullif(v_route ->> 'reviewedBy','') is null or
      nullif(v_route ->> 'reviewedAt','') is null or
      v_route -> 'reviewedFacts' is distinct from v_facts then
      raise exception 'Specialist route % is unresolved or uses another instrument. Owner: %. Reason: %.',
        v_key,coalesce(v_route ->> 'owner','Transfer attorney'),
        coalesce(v_route ->> 'reason','Classification required') using errcode='22023';
    end if;
    if p_lane_id is not null then
      v_task := journey_private.phase5_route_task(v_key);
      select status into v_status from public.transaction_subprocess_steps
        where subprocess_id=p_lane_id and step_key=v_task;
      if v_status is distinct from 'completed' then
        raise exception 'Complete specialist task % before signing or lodgement.',v_task using errcode='22023';
      end if;
    end if;
  end loop;
  if pg_catalog.array_length(journey_private.phase5_required_routes(v_profile),1) is not null
    and p_lane_id is not null then
    select status into v_status from public.transaction_subprocess_steps
      where subprocess_id=p_lane_id and step_key='specialist_classification_review';
    if v_status is distinct from 'completed' then
      raise exception 'Complete specialist classification before signing or lodgement.' using errcode='22023';
    end if;
  end if;
end; $$;

revoke all on function journey_private.phase5_assert_routes(uuid,uuid) from public,anon,authenticated;

create function journey_private.authorize_specialist_route_decision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_route record; v_prior jsonb;
begin
  if new.routing_profile_json #> '{scenarioProfile,specialistRoutes}'
    is not distinct from old.routing_profile_json #> '{scenarioProfile,specialistRoutes}' then return new; end if;
  for v_route in select key,value from pg_catalog.jsonb_each(
    coalesce(old.routing_profile_json #> '{scenarioProfile,specialistRoutes}','{}'::jsonb)) loop
    if v_route.value ->> 'active'='true' and
      new.routing_profile_json #>> array['scenarioProfile','specialistRoutes',v_route.key,'active'] is distinct from 'true' and
      (auth.uid() is null or not coalesce(public.bridge_can_mutate_attorney_lane(
        new.id,'transfer_attorney','workflow'),false)) then
      raise exception 'Only the assigned transfer attorney may remove a specialist hold.' using errcode='42501';
    end if;
  end loop;
  for v_route in select key,value from pg_catalog.jsonb_each(
    coalesce(new.routing_profile_json #> '{scenarioProfile,specialistRoutes}','{}'::jsonb)) loop
    v_prior := old.routing_profile_json #> array['scenarioProfile','specialistRoutes',v_route.key];
    if v_route.value ->> 'status' not in ('confirmed','hold') or
      v_route.value is not distinct from v_prior then continue; end if;
    if auth.uid() is null or v_route.value ->> 'reviewedBy' is distinct from auth.uid()::text or
      not coalesce(public.bridge_can_mutate_attorney_lane(new.id,'transfer_attorney','workflow'),false) then
      raise exception 'Only the assigned transfer attorney may classify a specialist route.' using errcode='42501';
    end if;
  end loop;
  return new;
end; $$;
revoke all on function journey_private.authorize_specialist_route_decision() from public,anon,authenticated;
create trigger trg_authorize_specialist_route_decision
before update of routing_profile_json on public.transactions
for each row execute function journey_private.authorize_specialist_route_decision();

create function journey_private.withdraw_readiness_on_specialist_route_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.routing_profile_json #> '{scenarioProfile,specialistRoutes}'
      is distinct from new.routing_profile_json #> '{scenarioProfile,specialistRoutes}' or
    old.routing_profile_json #> '{scenarioProfile,exceptions}'
      is distinct from new.routing_profile_json #> '{scenarioProfile,exceptions}' or
    old.routing_profile_json -> 'propertyTenure'
      is distinct from new.routing_profile_json -> 'propertyTenure' then
    perform journey_private.withdraw_unlodged_attorney_readiness(
      new.id,'specialist_route_changed','transfer');
  end if;
  return new;
end; $$;
revoke all on function journey_private.withdraw_readiness_on_specialist_route_change() from public,anon,authenticated;
create trigger trg_withdraw_readiness_on_specialist_route_change
after update of routing_profile_json on public.transactions
for each row execute function journey_private.withdraw_readiness_on_specialist_route_change();

-- Extend the existing party gate without changing prior migrations. Estate and
-- insolvency capacity can proceed only through completed specialist review.
do $$
declare v_definition text;
begin
  select pg_catalog.pg_get_functiondef('journey_private.assert_attorney_party_capacity_ready(uuid,text)'::pg_catalog.regprocedure)
    into v_definition;
  if pg_catalog.strpos(v_definition,
    '(''individual'', ''company'', ''close_corporation'', ''trust'')')=0 or
    pg_catalog.strpos(v_definition,'v_review := coalesce(v_party -> ''capacityReview''')=0 then
    raise exception 'Phase 2 party gate changed; review specialist extension.';
  end if;
  v_definition := pg_catalog.replace(v_definition,
    '(''individual'', ''company'', ''close_corporation'', ''trust'')',
    '(''individual'', ''company'', ''close_corporation'', ''trust'', ''estate'', ''insolvency'', ''other'')');
  v_definition := pg_catalog.replace(v_definition,
    'if v_party ->> ''entityType'' = ''individual'' and v_party ->> ''maritalRegime'' = ''other'' then
      raise exception ''Party % needs a specialist marital-capacity review.'',
        coalesce(v_party ->> ''name'', v_party ->> ''id'') using errcode = ''22023'';
    end if;',
    '-- Exceptional marital capacity is reviewed through the Phase 5 specialist route.');
  v_definition := pg_catalog.replace(v_definition,
    'v_review := coalesce(v_party -> ''capacityReview'', ''{}''::jsonb);',
    'if v_party ->> ''entityType'' in (''estate'',''insolvency'',''other'') or
       (v_party ->> ''entityType''=''individual'' and v_party ->> ''maritalRegime''=''other'') then
       if v_party ->> ''entityType''<>''individual'' and (
         pg_catalog.jsonb_typeof(v_party -> ''representatives'') is distinct from ''array''
         or pg_catalog.jsonb_array_length(v_party -> ''representatives'')=0) then
         raise exception ''Record the specialist representative and authority.'' using errcode=''22023'';
       end if;
       perform journey_private.phase5_assert_routes(p_transaction_id,
         (select id from public.transaction_subprocesses where transaction_id=p_transaction_id and process_type=''transfer'' limit 1));
       continue;
     end if;
     v_review := coalesce(v_party -> ''capacityReview'', ''{}''::jsonb);');
  execute v_definition;
end; $$;

-- Keep the earlier funding and tax gates active for this plan generation.
do $$
declare v_definition text;
begin
  select pg_catalog.pg_get_functiondef('journey_private.enforce_attorney_funding_handoffs()'::pg_catalog.regprocedure) into v_definition;
  if pg_catalog.strpos(v_definition,
    '''attorney_matter_workflow_plan_v12'', ''attorney_matter_workflow_plan_v13''')=0 then
    raise exception 'Phase 3 funding gate changed; review Phase 5 version extension.'; end if;
  execute pg_catalog.replace(v_definition,
    '''attorney_matter_workflow_plan_v12'', ''attorney_matter_workflow_plan_v13''',
    '''attorney_matter_workflow_plan_v12'', ''attorney_matter_workflow_plan_v13'', ''attorney_matter_workflow_plan_v14''');
  select pg_catalog.pg_get_functiondef('journey_private.enforce_attorney_phase4_tax_clearances()'::pg_catalog.regprocedure) into v_definition;
  if pg_catalog.strpos(v_definition,'''attorney_matter_workflow_plan_v13''')=0 then
    raise exception 'Phase 4 tax gate changed; review Phase 5 version extension.'; end if;
  execute pg_catalog.replace(v_definition,
    'if v_profile #>> ''{workflowPlan,version}'' <> ''attorney_matter_workflow_plan_v13'' then return new; end if;',
    'if v_profile #>> ''{workflowPlan,version}'' not in (''attorney_matter_workflow_plan_v13'',''attorney_matter_workflow_plan_v14'') then return new; end if;');
end; $$;

create function journey_private.enforce_attorney_phase5_specialist_routes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_matter uuid; v_lane text; v_profile jsonb; v_key text; v_route jsonb;
begin
  if new.status not in ('completed','completed_externally','not_applicable') then return new; end if;
  if tg_op='UPDATE' and old.status is not distinct from new.status and old.comment is not distinct from new.comment then return new; end if;
  select transaction_id,process_type into v_matter,v_lane from public.transaction_subprocesses where id=new.subprocess_id;
  if v_lane <> 'transfer' then return new; end if;
  select routing_profile_json into v_profile from public.transactions where id=v_matter;
  if v_profile #>> '{workflowPlan,version}' <> 'attorney_matter_workflow_plan_v14' then return new; end if;
  if new.step_key in ('lodgement_ready','lodged_at_deeds_office','buyer_signing_review','seller_signing_review') then
    perform journey_private.phase5_assert_routes(v_matter,new.subprocess_id);
  end if;
  if new.step_key='specialist_classification_review' then
    if new.status <> 'completed' or nullif(pg_catalog.btrim(coalesce(new.comment,'')),'') is null then
      raise exception 'Complete specialist classification with an attorney note.' using errcode='22023'; end if;
    perform journey_private.phase5_assert_routes(v_matter,null);
  end if;
  for v_key in select pg_catalog.unnest(journey_private.phase5_required_routes(v_profile)) loop
    if new.step_key=journey_private.phase5_route_task(v_key) then
      v_route := v_profile #> array['scenarioProfile','specialistRoutes',v_key];
      if new.status <> 'completed' or nullif(pg_catalog.btrim(coalesce(new.comment,'')),'') is null or
        v_route ->> 'status' is distinct from 'confirmed' or
        v_route ->> 'instrument' is distinct from 'deeds_transfer' or
        v_route -> 'reviewedFacts' is distinct from journey_private.phase5_route_facts(v_profile) then
        raise exception 'Complete specialist classification and record reviewed evidence for %.',v_key using errcode='22023';
      end if;
    end if;
  end loop;
  return new;
end; $$;
revoke all on function journey_private.enforce_attorney_phase5_specialist_routes() from public,anon,authenticated;
create trigger trg_enforce_attorney_phase5_specialist_routes
before insert or update of status,comment on public.transaction_subprocess_steps
for each row execute function journey_private.enforce_attorney_phase5_specialist_routes();

-- Existing open plans receive the classification hold. Historical rows remain.
do $$
declare v_matter record; v_lane jsonb; v_lanes jsonb; v_steps jsonb; v_key text; v_route text;
begin
  for v_matter in select id,routing_profile_json profile from public.transactions
    where routing_profile_json #>> '{workflowPlan,version}'='attorney_matter_workflow_plan_v13'
      and routing_profile_json #>> '{workflowPlan,status}'='active'
      and pg_catalog.lower(coalesce(lifecycle_state,'')) not in ('registered','completed','archived','cancelled','canceled')
      and not exists (select 1 from public.transaction_subprocesses lane
        join public.transaction_subprocess_steps s on s.subprocess_id=lane.id
        where lane.transaction_id=transactions.id and lane.process_type='transfer'
          and s.step_key='lodged_at_deeds_office' and s.status='completed')
  loop
    v_lanes := '[]'::jsonb;
    for v_lane in select value from pg_catalog.jsonb_array_elements(v_matter.profile #> '{workflowPlan,lanes}') loop
      if v_lane ->> 'laneKey'='transfer' then
        v_steps := '[]'::jsonb;
        for v_key in select value from pg_catalog.jsonb_array_elements_text(v_lane -> 'stepKeys') loop
          if v_key='party_capacity_specialist_review' then continue; end if;
          v_steps := v_steps || pg_catalog.to_jsonb(v_key);
          if v_key='seller_party_capacity_review' and
            pg_catalog.array_length(journey_private.phase5_required_routes(v_matter.profile),1) is not null then
            v_steps := v_steps || '"specialist_classification_review"'::jsonb;
          end if;
        end loop;
        v_lane := pg_catalog.jsonb_set(v_lane,'{stepKeys}',v_steps);
        v_lane := pg_catalog.jsonb_set(v_lane,'{taskCount}',pg_catalog.to_jsonb(pg_catalog.jsonb_array_length(v_steps)));
      end if;
      v_lanes := v_lanes || pg_catalog.jsonb_build_array(v_lane);
    end loop;
    update public.transactions set routing_profile_json=pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(v_matter.profile,'{workflowPlan,lanes}',v_lanes),
      '{workflowPlan,version}','"attorney_matter_workflow_plan_v14"'::jsonb)
      where id=v_matter.id;
  end loop;
end; $$;

insert into public.transaction_subprocess_steps
  (subprocess_id,step_key,step_label,status,owner_type,sort_order,visibility_scope)
select lane.id,'specialist_classification_review','Classify Specialist Routes','not_started',
  'attorney',5,'internal'
from public.transactions t
join public.transaction_subprocesses lane on lane.transaction_id=t.id and lane.process_type='transfer'
where t.routing_profile_json #>> '{workflowPlan,version}'='attorney_matter_workflow_plan_v14'
  and 'specialist_classification_review'=any(select pg_catalog.jsonb_array_elements_text(
    coalesce(t.routing_profile_json #> '{workflowPlan,lanes,0,stepKeys}','[]'::jsonb)))
on conflict (subprocess_id,step_key) do nothing;

commit;
