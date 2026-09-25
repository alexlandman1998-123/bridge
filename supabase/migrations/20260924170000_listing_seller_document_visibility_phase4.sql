begin;

-- Keep the existing authenticated seller-portal payload (including its final
-- signed-artifact fence) as the source, then apply document audience filtering
-- before the JSON reaches the browser. The application repeats this check as
-- defence in depth, but the database RPC is the security boundary.
alter function public.bridge_private_listing_seller_portal_payload(text, text, boolean)
  rename to bridge_private_listing_seller_portal_payload_visibility_phase4_source;

revoke all on function public.bridge_private_listing_seller_portal_payload_visibility_phase4_source(text, text, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.bridge_seller_portal_record_visible_phase4(p_record jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  with resolved as (
    select
      lower(trim(coalesce(
        p_record ->> 'visibility',
        p_record ->> 'document_visibility',
        p_record ->> 'visibility_scope',
        p_record -> 'metadata' ->> 'visibility',
        ''
      ))) as visibility,
      lower(trim(coalesce(
        p_record ->> 'clientVisible',
        p_record ->> 'client_visible',
        p_record ->> 'visibleToSeller',
        p_record ->> 'visible_to_seller',
        ''
      ))) as explicit_seller_visibility
  )
  select case
    when visibility in (
      'internal', 'internal_only', 'agent_only', 'manager_only',
      'compliance_only', 'shared_role_players', 'role_player',
      'role_player_only', 'professional_shared'
    ) then false
    when explicit_seller_visibility in ('false', '0', 'no', 'off') then false
    when visibility in ('seller_visible', 'client_visible', 'client', 'seller', 'public') then true
    when explicit_seller_visibility in ('true', '1', 'yes', 'on') then true
    else false
  end
  from resolved;
$$;

revoke all on function public.bridge_seller_portal_record_visible_phase4(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.bridge_filter_seller_portal_documents_phase4(p_payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_requirements jsonb := '[]'::jsonb;
  v_documents jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(v_payload) <> 'object' then
    return '{}'::jsonb;
  end if;

  select coalesce(jsonb_agg(item.requirement order by item.ordinality), '[]'::jsonb)
    into v_requirements
  from jsonb_array_elements(coalesce(v_payload -> 'requirements', '[]'::jsonb))
    with ordinality as item(requirement, ordinality)
  where public.bridge_seller_portal_record_visible_phase4(item.requirement);

  select coalesce(jsonb_agg(item.document order by item.ordinality), '[]'::jsonb)
    into v_documents
  from jsonb_array_elements(coalesce(v_payload -> 'documents', '[]'::jsonb))
    with ordinality as item(document, ordinality)
  where public.bridge_seller_portal_record_visible_phase4(item.document)
    or (
      nullif(trim(coalesce(
        item.document ->> 'visibility',
        item.document ->> 'document_visibility',
        item.document ->> 'visibility_scope',
        ''
      )), '') is null
      and exists (
        select 1
        from jsonb_array_elements(v_requirements) as requirement(row)
        where nullif(trim(item.document ->> 'requirement_id'), '') is not null
          and item.document ->> 'requirement_id' = requirement.row ->> 'id'
      )
    );

  v_payload := jsonb_set(v_payload, '{requirements}', v_requirements, true);
  v_payload := jsonb_set(v_payload, '{documents}', v_documents, true);
  return v_payload;
end;
$$;

revoke all on function public.bridge_filter_seller_portal_documents_phase4(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.bridge_private_listing_seller_portal_payload(
  p_token text,
  p_access_token text default null,
  p_require_access boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_result jsonb;
begin
  v_result := public.bridge_private_listing_seller_portal_payload_visibility_phase4_source(
    p_token,
    p_access_token,
    p_require_access
  );
  if v_result is null or coalesce(v_result ->> 'authRequired', 'false') = 'true' then
    return v_result;
  end if;
  return public.bridge_filter_seller_portal_documents_phase4(v_result);
end;
$$;

revoke all on function public.bridge_private_listing_seller_portal_payload(text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.bridge_private_listing_seller_portal_payload(text, text, boolean)
  to anon, authenticated;

comment on function public.bridge_private_listing_seller_portal_payload(text, text, boolean) is
  'Authenticated seller portal payload with final-artifact fencing and fail-closed seller document visibility filtering.';

notify pgrst, 'reload schema';

commit;
