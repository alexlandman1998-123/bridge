begin;

-- Seller-visible agent contact and authored activity. The listing and
-- organisation are derived from the existing authenticated seller session.
create or replace function public.bridge_seller_listing_overview_context(p_token text, p_access_token text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_portal jsonb;
  v_listing public.private_listings%rowtype;
  v_agent jsonb;
  v_activity jsonb;
begin
  if nullif(trim(p_token), '') is null or nullif(trim(p_access_token), '') is null then
    raise exception 'Seller authentication required.' using errcode = '42501';
  end if;
  v_portal := public.bridge_private_listing_seller_portal_core_payload(p_token, p_access_token, true);
  if v_portal is null or coalesce((v_portal->>'authRequired')::boolean, false) then
    raise exception 'Seller authentication required.' using errcode = '42501';
  end if;
  select * into v_listing from public.private_listings where id = (v_portal->'listing'->>'id')::uuid;
  if not found then raise exception 'Listing unavailable.' using errcode = '42501'; end if;
  select jsonb_build_object(
    'name', coalesce(nullif(p.full_name, ''), nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')),
    'email', p.email,
    'phone', coalesce(to_jsonb(p)->>'phone', to_jsonb(p)->>'phone_number'),
    'avatarUrl', coalesce(to_jsonb(p)->>'avatar_url', to_jsonb(p)->>'profile_photo_url')
  ) into v_agent from public.profiles p where p.id = v_listing.assigned_agent_id;
  select coalesce(jsonb_agg(event order by created_at desc), '[]'::jsonb) into v_activity from (
    select a.created_at, jsonb_build_object(
      'id', a.id, 'type', a.activity_type, 'title', a.activity_title,
      'description', a.activity_description, 'timestamp', a.created_at,
      'actor', coalesce(nullif(p.full_name, ''), nullif(trim(concat_ws(' ',p.first_name,p.last_name)), ''), 'Property team'),
      'actorRole', case when a.performed_by = v_listing.assigned_agent_id then 'Agent'
        else coalesce(a.metadata->>'actorRole', 'Property team') end,
      'visibility', 'client_visible'
    ) as event
    from public.private_listing_activity a
    left join public.profiles p on p.id = a.performed_by
    where a.private_listing_id = v_listing.id
      and lower(coalesce(a.visibility, a.metadata->>'visibility', '')) = 'client_visible'
    order by a.created_at desc limit 20
  ) visible_activity;
  return jsonb_build_object('listingId', v_listing.id, 'agent', v_agent, 'activity', v_activity, 'updatedAt', now());
end;
$$;
revoke all on function public.bridge_seller_listing_overview_context(text,text) from public;
grant execute on function public.bridge_seller_listing_overview_context(text,text) to anon, authenticated;
commit;
