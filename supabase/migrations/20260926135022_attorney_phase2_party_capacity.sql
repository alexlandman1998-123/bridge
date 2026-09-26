begin;

-- Party decisions live in the existing matter scenario, while these two
-- tasks give the transfer attorney one auditable completion per side.
insert into journey_private.task_catalog (
  lane_key, step_key, definition, phase_key, phase_label, phase_order, task_order
) values
  ('transfer', 'buyer_party_capacity_review', pg_catalog.jsonb_build_object(
    'processKey', 'transfer', 'processLabel', 'Property transfer',
    'stepKey', 'buyer_party_capacity_review', 'ownerRole', 'transfer_attorney',
    'defaultVisibility', 'internal', 'clientVisibleAllowed', false,
    'professional', pg_catalog.jsonb_build_object('title', 'Resolve Each Buyer Capacity',
      'description', 'Every buyer and signatory requires a recorded attorney capacity decision.')),
    'fica_authority', 'FICA & Authority', 1, 2),
  ('transfer', 'seller_party_capacity_review', pg_catalog.jsonb_build_object(
    'processKey', 'transfer', 'processLabel', 'Property transfer',
    'stepKey', 'seller_party_capacity_review', 'ownerRole', 'transfer_attorney',
    'defaultVisibility', 'internal', 'clientVisibleAllowed', false,
    'professional', pg_catalog.jsonb_build_object('title', 'Resolve Each Seller Capacity',
      'description', 'Every seller and signatory requires a recorded attorney capacity decision.')),
    'fica_authority', 'FICA & Authority', 1, 3),
  ('transfer', 'party_capacity_specialist_review', pg_catalog.jsonb_build_object(
    'processKey', 'transfer', 'processLabel', 'Property transfer',
    'stepKey', 'party_capacity_specialist_review', 'ownerRole', 'transfer_attorney',
    'defaultVisibility', 'internal', 'clientVisibleAllowed', false,
    'professional', pg_catalog.jsonb_build_object('title', 'Specialist Party Capacity Hold',
      'description', 'A specialist must classify this party before ordinary signing can continue.')),
    'fica_authority', 'FICA & Authority', 1, 4)
on conflict (lane_key, step_key) do update set
  definition = excluded.definition,
  phase_key = excluded.phase_key,
  phase_label = excluded.phase_label,
  phase_order = excluded.phase_order,
  task_order = excluded.task_order;

create or replace function journey_private.assert_attorney_party_capacity_ready(
  p_transaction_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile jsonb;
  v_party jsonb;
  v_review jsonb;
  v_facts jsonb;
  v_checks text[];
  v_missing_check text;
  v_count integer := 0;
begin
  select t.routing_profile_json #> '{scenarioProfile,parties}'
  into v_profile from public.transactions t where t.id = p_transaction_id;
  if pg_catalog.jsonb_typeof(v_profile) is distinct from 'array' then
    raise exception 'Record and confirm the buyer and seller party scenario before signing.' using errcode = '22023';
  end if;
  for v_party in select value from pg_catalog.jsonb_array_elements(v_profile)
    where value ->> 'role' = p_role
  loop
    v_count := v_count + 1;
    if coalesce(v_party ->> 'entityType', '') not in
      ('individual', 'company', 'close_corporation', 'trust') then
      raise exception 'Party % needs a specialist capacity hold and route.',
        coalesce(v_party ->> 'name', v_party ->> 'id') using errcode = '22023';
    end if;
    if v_party ->> 'entityType' = 'individual' and v_party ->> 'maritalRegime' = 'other' then
      raise exception 'Party % needs a specialist marital-capacity review.',
        coalesce(v_party ->> 'name', v_party ->> 'id') using errcode = '22023';
    end if;
    if coalesce(v_party ->> 'taxResidence', 'unknown') = 'unknown'
      or (v_party ->> 'entityType' = 'individual' and (
        coalesce(v_party ->> 'identityRoute', 'unknown') = 'unknown'
        or coalesce(v_party ->> 'maritalRegime', 'unknown') = 'unknown')) then
      raise exception 'Confirm identity, tax residence and marital capacity for party %.',
        coalesce(v_party ->> 'name', v_party ->> 'id') using errcode = '22023';
    end if;
    if v_party ->> 'entityType' in ('company', 'close_corporation', 'trust')
      and (pg_catalog.jsonb_typeof(v_party -> 'representatives') is distinct from 'array'
        or pg_catalog.jsonb_array_length(v_party -> 'representatives') = 0
        or exists (
          select 1 from pg_catalog.jsonb_array_elements(v_party -> 'representatives') signer
          where nullif(pg_catalog.btrim(coalesce(signer ->> 'name', '')), '') is null
            or nullif(pg_catalog.btrim(coalesce(signer ->> 'capacity', '')), '') is null
        )) then
      raise exception 'Name every authorised signatory and capacity for party %.',
        coalesce(v_party ->> 'name', v_party ->> 'id') using errcode = '22023';
    end if;
    v_review := coalesce(v_party -> 'capacityReview', '{}'::jsonb);
    if v_review ->> 'status' is distinct from 'cleared' then
      raise exception 'Record a current attorney capacity decision for party %.',
        coalesce(v_party ->> 'name', v_party ->> 'id') using errcode = '22023';
    end if;
    v_checks := array['identity_fica', 'tax_residence'];
    if v_party ->> 'entityType' = 'individual' then
      v_checks := v_checks || array['marital_capacity'];
      if v_party ->> 'maritalRegime' = 'in_community' then
        v_checks := v_checks || array['spouse_consent'];
      end if;
      if v_party ->> 'maritalRegime' = 'foreign' then
        v_checks := v_checks || array['foreign_law'];
      end if;
      if v_party ->> 'identityRoute' = 'foreign_passport' and p_role = 'buyer' then
        v_checks := v_checks || array['foreign_tax_entry'];
      end if;
    elsif v_party ->> 'entityType' in ('company', 'close_corporation') then
      v_checks := v_checks || array['registration', 'beneficial_ownership', 'resolution', 'signatories'];
    elsif v_party ->> 'entityType' = 'trust' then
      v_checks := v_checks || array['trust_deed', 'letters_of_authority',
        'beneficial_ownership', 'resolution', 'signatories'];
    end if;
    select check_key into v_missing_check from pg_catalog.unnest(v_checks) check_key
      where v_review #>> array['confirmations', check_key] is distinct from 'true'
      limit 1;
    if v_missing_check is not null then
      raise exception 'Confirm % for party % before clearing capacity.',
        v_missing_check, coalesce(v_party ->> 'name', v_party ->> 'id') using errcode = '22023';
    end if;
    v_facts := pg_catalog.jsonb_build_object(
      'id', v_party -> 'id', 'role', v_party -> 'role', 'name', v_party -> 'name',
      'entityType', v_party -> 'entityType', 'maritalRegime', v_party -> 'maritalRegime',
      'ownershipShare', v_party -> 'ownershipShare',
      'identityRoute', v_party -> 'identityRoute',
      'taxResidence', v_party -> 'taxResidence',
      'representatives', coalesce(v_party -> 'representatives', '[]'::jsonb));
    if nullif(pg_catalog.btrim(coalesce(v_review ->> 'note', '')), '') is null
      or nullif(coalesce(v_review ->> 'reviewedBy', ''), '') is null
      or nullif(coalesce(v_review ->> 'reviewedAt', ''), '') is null
      or v_review -> 'reviewedFacts' is distinct from v_facts then
      raise exception 'Record a current attorney capacity decision for party %.',
        coalesce(v_party ->> 'name', v_party ->> 'id') using errcode = '22023';
    end if;
  end loop;
  if v_count = 0 then
    raise exception 'Identify at least one % before signing.', p_role using errcode = '22023';
  end if;
end;
$$;

revoke all on function journey_private.assert_attorney_party_capacity_ready(uuid,text)
  from public, anon, authenticated;

create or replace function journey_private.authorize_party_capacity_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_party jsonb;
  v_prior jsonb;
  v_review jsonb;
begin
  if new.routing_profile_json #> '{scenarioProfile,parties}'
    is not distinct from old.routing_profile_json #> '{scenarioProfile,parties}' then return new; end if;
  for v_party in select value from pg_catalog.jsonb_array_elements(
    coalesce(new.routing_profile_json #> '{scenarioProfile,parties}', '[]'::jsonb))
  loop
    v_review := v_party -> 'capacityReview';
    if v_review ->> 'status' <> 'cleared' then continue; end if;
    select value into v_prior from pg_catalog.jsonb_array_elements(
      coalesce(old.routing_profile_json #> '{scenarioProfile,parties}', '[]'::jsonb))
    where value ->> 'id' = v_party ->> 'id' limit 1;
    if v_review is not distinct from v_prior -> 'capacityReview' then continue; end if;
    if auth.uid() is null
      or v_review ->> 'reviewedBy' is distinct from auth.uid()::text
      or not coalesce(public.bridge_can_mutate_attorney_lane(
        new.id, 'transfer_attorney', 'workflow'), false) then
      raise exception 'Only the assigned transfer attorney may clear party capacity.' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function journey_private.authorize_party_capacity_decision()
  from public, anon, authenticated;

drop trigger if exists trg_authorize_party_capacity_decision on public.transactions;
create trigger trg_authorize_party_capacity_decision
before update of routing_profile_json on public.transactions
for each row execute function journey_private.authorize_party_capacity_decision();

create or replace function journey_private.enforce_attorney_party_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid;
  v_lane_key text;
  v_role text;
  v_prerequisite text;
  v_status text;
begin
  if new.status not in ('completed', 'completed_externally', 'not_applicable') then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;
  select lane.transaction_id, lane.process_type into v_transaction_id, v_lane_key
  from public.transaction_subprocesses lane where lane.id = new.subprocess_id;
  if v_lane_key <> 'transfer' then return new; end if;
  if new.step_key = 'party_capacity_specialist_review' and new.status = 'completed' then
    raise exception 'A specialist hold needs a reviewed specialist route before ordinary completion.' using errcode = '22023';
  end if;
  if new.step_key in ('buyer_party_capacity_review', 'buyer_signing_review') then v_role := 'buyer'; end if;
  if new.step_key in ('seller_party_capacity_review', 'seller_signing_review') then v_role := 'seller'; end if;
  if new.step_key in ('lodgement_ready', 'lodged_at_deeds_office') then
    perform journey_private.assert_attorney_party_capacity_ready(v_transaction_id, 'buyer');
    perform journey_private.assert_attorney_party_capacity_ready(v_transaction_id, 'seller');
    for v_prerequisite in select pg_catalog.unnest(array[
      'buyer_party_capacity_review', 'seller_party_capacity_review'
    ]) loop
      select s.status into v_status from public.transaction_subprocess_steps s
      where s.subprocess_id = new.subprocess_id and s.step_key = v_prerequisite;
      if v_status is distinct from 'completed' then
        raise exception 'Attorney-reviewed completion of % is required before lodgement.', v_prerequisite using errcode = '22023';
      end if;
    end loop;
  end if;
  if v_role is null then return new; end if;
  if new.status <> 'completed' then
    raise exception 'Party capacity and signing require attorney-reviewed completion.' using errcode = '22023';
  end if;
  perform journey_private.assert_attorney_party_capacity_ready(v_transaction_id, v_role);
  if new.step_key in ('buyer_signing_review', 'seller_signing_review') then
    for v_prerequisite in select pg_catalog.unnest(array[
      v_role || '_fica_review', v_role || '_party_capacity_review'
    ]) loop
      select s.status into v_status from public.transaction_subprocess_steps s
      where s.subprocess_id = new.subprocess_id and s.step_key = v_prerequisite;
      if v_status is distinct from 'completed' then
        raise exception 'Complete % with attorney review before signing.', v_prerequisite using errcode = '22023';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function journey_private.enforce_attorney_party_capacity()
  from public, anon, authenticated;

drop trigger if exists trg_enforce_attorney_party_capacity on public.transaction_subprocess_steps;
create trigger trg_enforce_attorney_party_capacity
before insert or update of status on public.transaction_subprocess_steps
for each row execute function journey_private.enforce_attorney_party_capacity();

-- A changed per-party decision withdraws an unlodged readiness attestation.
create or replace function journey_private.withdraw_readiness_on_party_capacity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.routing_profile_json #> '{scenarioProfile,parties}'
    is distinct from new.routing_profile_json #> '{scenarioProfile,parties}' then
    perform journey_private.withdraw_unlodged_attorney_readiness(
      new.id, 'party_capacity_changed', 'transfer');
  end if;
  return new;
end;
$$;

revoke all on function journey_private.withdraw_readiness_on_party_capacity_change()
  from public, anon, authenticated;

drop trigger if exists trg_withdraw_attorney_readiness_on_party_capacity_change on public.transactions;
create trigger trg_withdraw_attorney_readiness_on_party_capacity_change
after update of routing_profile_json on public.transactions
for each row execute function journey_private.withdraw_readiness_on_party_capacity_change();

-- Add the new decisions to open, active transfer plans. Existing task rows and
-- outcomes are untouched. A later attorney profile save produces the full v11
-- fingerprint; until then the prior plan version remains visible for review.
with affected as (
  select t.id, t.routing_profile_json as routing
  from public.transactions t
  where t.routing_profile_json #>> '{workflowPlan,status}' = 'active'
    and pg_catalog.lower(coalesce(t.lifecycle_state, '')) not in
      ('registered', 'completed', 'archived', 'cancelled', 'canceled')
    and pg_catalog.jsonb_typeof(t.routing_profile_json #> '{workflowPlan,lanes}') = 'array'
    and exists (
      select 1 from pg_catalog.jsonb_array_elements(t.routing_profile_json #> '{workflowPlan,lanes}') lane
      where lane ->> 'laneKey' = 'transfer'
        and not (lane -> 'stepKeys') ? 'buyer_party_capacity_review'
    )
    and not exists (
      select 1 from public.transaction_subprocesses process
      join public.transaction_subprocess_steps step on step.subprocess_id = process.id
      where process.transaction_id = t.id and process.process_type = 'transfer'
        and step.step_key = 'lodged_at_deeds_office' and step.status = 'completed'
    )
), rebuilt as (
  select affected.id,
    pg_catalog.jsonb_set(affected.routing, '{workflowPlan,lanes}', (
      select pg_catalog.jsonb_agg(
        case when lane.value ->> 'laneKey' <> 'transfer' then lane.value
        else pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(lane.value, '{stepKeys}', keys.next_keys),
          '{taskCount}', pg_catalog.to_jsonb(pg_catalog.jsonb_array_length(keys.next_keys)))
        end order by lane.ordinality)
      from pg_catalog.jsonb_array_elements(affected.routing #> '{workflowPlan,lanes}')
        with ordinality lane(value, ordinality)
      cross join lateral (
        select coalesce((
          select pg_catalog.jsonb_agg(task.value order by task.ordinality)
          from pg_catalog.jsonb_array_elements_text(lane.value -> 'stepKeys')
            with ordinality task(value, ordinality)
          where task.ordinality <= anchor.position
        ), '[]'::jsonb)
        || case when (lane.value -> 'stepKeys') ? 'buyer_party_capacity_review' then '[]'::jsonb
          else pg_catalog.jsonb_build_array('buyer_party_capacity_review', 'seller_party_capacity_review') end
        || case when (lane.value -> 'stepKeys') ? 'party_capacity_specialist_review'
          or not (
            exists (select 1 from pg_catalog.jsonb_array_elements(
              coalesce(affected.routing #> '{scenarioProfile,parties}', '[]'::jsonb)) party
              where coalesce(party ->> 'entityType', 'unknown') not in
                ('individual', 'company', 'close_corporation', 'trust')
                or (party ->> 'entityType' = 'individual' and party ->> 'maritalRegime' = 'other'))
            or exists (select 1 from pg_catalog.jsonb_array_elements_text(coalesce(
              affected.routing #> '{scenarioProfile,exceptions}', '[]'::jsonb)) exception(value)
              where nullif(pg_catalog.btrim(exception.value), '') is not null)
          ) then '[]'::jsonb
          else pg_catalog.jsonb_build_array('party_capacity_specialist_review') end
        || coalesce((
          select pg_catalog.jsonb_agg(task.value order by task.ordinality)
          from pg_catalog.jsonb_array_elements_text(lane.value -> 'stepKeys')
            with ordinality task(value, ordinality)
          where task.ordinality > anchor.position
        ), '[]'::jsonb) as next_keys
        from (
          select coalesce(
            (select task.ordinality from pg_catalog.jsonb_array_elements_text(lane.value -> 'stepKeys')
              with ordinality task(value, ordinality) where task.value = 'seller_fica_review' limit 1),
            (select task.ordinality from pg_catalog.jsonb_array_elements_text(lane.value -> 'stepKeys')
              with ordinality task(value, ordinality) where task.value = 'buyer_fica_review' limit 1),
            0) as position
        ) anchor
      ) keys
    ), true) as routing
  from affected
)
update public.transactions t set routing_profile_json = rebuilt.routing
from rebuilt where t.id = rebuilt.id;

insert into public.transaction_subprocess_steps (
  subprocess_id, step_key, step_label, status, owner_type, sort_order, visibility_scope
)
select process.id, task.value, catalog.definition #>> '{professional,title}',
  'not_started', 'attorney', task.ordinality, 'internal'
from public.transactions t
join public.transaction_subprocesses process on process.transaction_id = t.id
  and process.process_type = 'transfer'
cross join lateral pg_catalog.jsonb_array_elements(
  coalesce(t.routing_profile_json #> '{workflowPlan,lanes}', '[]'::jsonb)) lane
cross join lateral pg_catalog.jsonb_array_elements_text(lane -> 'stepKeys')
  with ordinality task(value, ordinality)
join journey_private.task_catalog catalog on catalog.lane_key = 'transfer'
  and catalog.step_key = task.value
where lane ->> 'laneKey' = 'transfer'
  and pg_catalog.lower(coalesce(t.lifecycle_state, '')) not in
    ('registered', 'completed', 'archived', 'cancelled', 'canceled')
  and not exists (
    select 1 from public.transaction_subprocess_steps lodged
    where lodged.subprocess_id = process.id and lodged.step_key = 'lodged_at_deeds_office'
      and lodged.status = 'completed'
  )
  and task.value in ('buyer_party_capacity_review', 'seller_party_capacity_review',
    'party_capacity_specialist_review')
on conflict (subprocess_id, step_key) do nothing;

commit;
