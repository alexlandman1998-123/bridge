begin;

-- The existing atomic attorney-update command writes JSON recipient arrays.
-- Normalize the older text[] column so that client-visible updates can save.
alter table public.transaction_attorney_lane_updates
  alter column client_recipients drop default,
  alter column client_recipients type jsonb using to_jsonb(client_recipients),
  alter column client_recipients set default '[]'::jsonb;

-- Project only broad, client-safe milestone states. The canonical task keys
-- remain inside journey_private and are never returned to a portal token.
create or replace function journey_private.client_transfer_milestones(p_source jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with tasks as (
    select lane ->> 'key' lane_key, phase ->> 'key' phase_key,
      task ->> 'key' task_key, task ->> 'status' status
    from jsonb_array_elements(coalesce(p_source -> 'lanes', '[]'::jsonb)) lane
    cross join lateral jsonb_array_elements(coalesce(lane -> 'phases', '[]'::jsonb)) phase
    cross join lateral jsonb_array_elements(coalesce(phase -> 'tasks', '[]'::jsonb)) task
  ), definitions(ordinal, milestone_key, task_ids, phase_key) as (
    values
      (1, 'instruction', array['transfer:instruction_received','transfer:matter_opened','transfer:otp_source_docs_checked']::text[], null::text),
      (2, 'fica', array[]::text[], 'fica_authority'),
      (3, 'rates', array['transfer:municipal_rates_clearance_review']::text[], null::text),
      (4, 'funding', array['transfer:cash_funding_source_review','transfer:payment_security_review',
        'bond:bank_conditions_resolved','bond:guarantees_issued','bond:guarantee_wording_accepted',
        'cancellation:cancellation_figures_received','cancellation:cancellation_guarantees_received',
        'cancellation:cancellation_guarantees_accepted']::text[], null::text),
      (5, 'signing', array['transfer:buyer_signing_review','transfer:seller_signing_review']::text[], null::text),
      (6, 'clearances', array[]::text[], 'financial_preparation'),
      (7, 'lodgement', array['transfer:lodged_at_deeds_office','bond:bond_lodged','cancellation:cancellation_lodged']::text[], null::text),
      (8, 'registration', array['transfer:registered','bond:bond_registered','cancellation:cancellation_registered']::text[], null::text)
  ), summaries as (
    select d.ordinal, d.milestone_key,
      count(t.task_key) task_count,
      count(t.task_key) filter (where t.status in ('completed','completed_externally','not_applicable')) resolved_count,
      count(t.task_key) filter (where t.status = 'not_applicable') not_applicable_count,
      count(t.task_key) filter (where t.status = 'blocked') blocked_count,
      count(t.task_key) filter (where t.status = 'waiting') waiting_count,
      count(t.task_key) filter (where t.status in ('in_progress','completed','completed_externally')) started_count
    from definitions d
    left join tasks t on (d.phase_key is not null and t.lane_key = 'transfer' and t.phase_key = d.phase_key
      and (d.milestone_key <> 'clearances' or t.task_key <> 'municipal_rates_clearance_review'))
      or (t.lane_key || ':' || t.task_key = any(d.task_ids))
    group by d.ordinal, d.milestone_key
  )
  select coalesce(jsonb_agg(jsonb_build_object('key', milestone_key, 'status',
    case
      when task_count = 0 or not_applicable_count = task_count then 'not_applicable'
      when blocked_count > 0 then 'blocked'
      when waiting_count > 0 then 'waiting'
      when resolved_count = task_count then 'completed'
      when started_count > 0 then 'in_progress'
      else 'not_started'
    end) order by ordinal), '[]'::jsonb)
  from summaries;
$$;

create or replace function journey_private.read_client_matter_journey(p_transaction_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_source jsonb; v_lanes jsonb;
begin
  v_source := journey_private.read_matter_journey(p_transaction_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'key', lane -> 'key',
    'phases', phase_rows.phases
  )), '[]'::jsonb)
  into v_lanes
  from jsonb_array_elements(coalesce(v_source -> 'lanes', '[]'::jsonb)) lane
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', phase -> 'key',
      'label', coalesce(phase -> 'clientLabel', phase -> 'label'),
      'clientLabel', coalesce(phase -> 'clientLabel', phase -> 'label'),
      'tasks', task_rows.tasks
    )), '[]'::jsonb) phases
    from jsonb_array_elements(coalesce(lane -> 'phases', '[]'::jsonb)) phase
    cross join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', format('client:%s:%s:%s:%s', p_transaction_id, lane ->> 'key', phase ->> 'key', task.ordinality - 1),
        'key', format('task_%s', task.ordinality),
        'phaseKey', phase -> 'key',
        'laneKey', lane -> 'key',
        'label', coalesce(task.value -> 'clientLabel', '"Matter update"'::jsonb),
        'clientLabel', coalesce(task.value -> 'clientLabel', '"Matter update"'::jsonb),
        'status', task.value -> 'status',
        'revision', task.value -> 'revision'
      ) order by task.ordinality), '[]'::jsonb) tasks
      from jsonb_array_elements(coalesce(phase -> 'tasks', '[]'::jsonb)) with ordinality task(value, ordinality)
    ) task_rows
  ) phase_rows;

  return v_source || jsonb_build_object('lanes', v_lanes,
    'clientTransferMilestones', journey_private.client_transfer_milestones(v_source));
end;
$$;

create or replace function public.bridge_read_buyer_transfer_journey_updates(p_transaction_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_updates jsonb;
begin
  if p_transaction_id is null or not coalesce(public.bridge_has_client_portal_token_transaction_access(p_transaction_id),false) then
    raise exception 'Buyer portal access is required.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'laneKey', 'transfer',
    'visibility', 'client_visible',
    'clientRecipients', jsonb_build_array('buyer'),
    'createdAt', item.created_at,
    'message', item.message,
    'metadata', jsonb_build_object('journeyBrief', item.metadata -> 'journeyBrief')
  ) order by item.created_at desc), '[]'::jsonb)
  into v_updates
  from (
    select id, created_at, message, metadata
    from public.transaction_attorney_lane_updates
    where transaction_id = p_transaction_id and lane_key = 'transfer'
      and visibility = 'client_visible' and client_recipients ? 'buyer'
      and metadata #>> '{journeyBrief,version}' = '1'
    order by created_at desc limit 20
  ) item;
  return v_updates;
end;
$$;

-- Seller onboarding links use a verified seller session rather than a buyer
-- transaction token. Return only the published transfer-journey brief.
create or replace function public.bridge_read_seller_transfer_journey_updates(p_token text, p_access_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_payload jsonb; v_listing_id uuid; v_transaction_id uuid; v_updates jsonb;
begin
  if nullif(btrim(p_token),'') is null or nullif(btrim(p_access_token),'') is null then
    raise exception 'Seller portal access is required.' using errcode='42501';
  end if;
  v_payload := public.bridge_private_listing_seller_portal_payload(p_token,p_access_token,true);
  if v_payload is null or coalesce((v_payload ->> 'authRequired')::boolean,false) then
    raise exception 'Seller portal access is required.' using errcode='42501';
  end if;
  v_listing_id := nullif(v_payload #>> '{listing,id}','')::uuid;
  if v_listing_id is null then raise exception 'Seller portal access is required.' using errcode='42501'; end if;
  v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing_id);
  if v_transaction_id is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'laneKey', 'transfer',
    'visibility', 'client_visible',
    'clientRecipients', jsonb_build_array('seller'),
    'createdAt', item.created_at,
    'message', item.message,
    'metadata', jsonb_build_object('journeyBrief', item.metadata -> 'journeyBrief')
  ) order by item.created_at desc), '[]'::jsonb)
  into v_updates
  from (
    select id, created_at, message, metadata
    from public.transaction_attorney_lane_updates
    where transaction_id = v_transaction_id and lane_key = 'transfer'
      and visibility = 'client_visible' and client_recipients ? 'seller'
      and metadata #>> '{journeyBrief,version}' = '1'
    order by created_at desc limit 20
  ) item;
  return v_updates;
end;
$$;

revoke all on function journey_private.client_transfer_milestones(jsonb) from public, anon, authenticated;
revoke all on function journey_private.read_client_matter_journey(uuid) from public, anon, authenticated;
revoke all on function public.bridge_read_buyer_transfer_journey_updates(uuid) from public;
grant execute on function public.bridge_read_buyer_transfer_journey_updates(uuid) to anon, authenticated;
revoke all on function public.bridge_read_seller_transfer_journey_updates(text,text) from public;
grant execute on function public.bridge_read_seller_transfer_journey_updates(text,text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
