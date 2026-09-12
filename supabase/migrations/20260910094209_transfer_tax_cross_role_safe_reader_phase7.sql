begin;

-- A client-safe projection must be made in the database, before a portal
-- response crosses the network. Client labels alone are insufficient because
-- internal task keys can disclose the tax route.
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

  return v_source || jsonb_build_object('lanes', v_lanes);
end;
$$;

create or replace function public.bridge_read_shared_matter_journey(p_transaction_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(((auth.uid() is not null and public.bridge_can_access_transaction_spine(p_transaction_id))
    or public.bridge_has_client_portal_token_transaction_access(p_transaction_id)
    or public.bridge_has_onboarding_token_transaction_access(p_transaction_id)), false) then
    raise exception 'You do not have access to this matter journey.' using errcode = '42501';
  end if;
  return journey_private.read_client_matter_journey(p_transaction_id);
end;
$$;

-- Professional workspaces retain the canonical keys needed to operate tasks.
-- This reader cannot be reached with a portal or onboarding token.
create or replace function public.bridge_read_professional_matter_journey(p_transaction_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.bridge_can_access_transaction_spine(p_transaction_id) then
    raise exception 'Professional matter access is required.' using errcode = '42501';
  end if;
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
  v_payload := public.bridge_private_listing_seller_portal_payload(p_token,p_access_token,true);
  if v_payload is null or coalesce((v_payload ->> 'authRequired')::boolean,false) then
    raise exception 'Seller portal access is required.' using errcode='42501';
  end if;
  v_listing_id := nullif(v_payload #>> '{listing,id}','')::uuid;
  if v_listing_id is null then raise exception 'Seller portal access is required.' using errcode='42501'; end if;
  v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing_id);
  if v_transaction_id is null then return null; end if;
  return journey_private.read_client_matter_journey(v_transaction_id);
end;
$$;

revoke all on function journey_private.read_client_matter_journey(uuid) from public, anon, authenticated;
revoke all on function public.bridge_read_shared_matter_journey(uuid) from public;
grant execute on function public.bridge_read_shared_matter_journey(uuid) to anon, authenticated;
revoke all on function public.bridge_read_professional_matter_journey(uuid) from public;
grant execute on function public.bridge_read_professional_matter_journey(uuid) to authenticated;
revoke all on function public.bridge_read_seller_shared_matter_journey(text,text) from public;
grant execute on function public.bridge_read_seller_shared_matter_journey(text,text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
