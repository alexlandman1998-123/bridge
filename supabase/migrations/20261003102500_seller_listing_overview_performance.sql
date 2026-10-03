begin;

-- Only anonymous metric rows leave this reader: no buyer names, contact
-- details, viewing notes, or internal workflow data are exposed to sellers.
create or replace function public.bridge_seller_listing_overview_performance(p_token text, p_access_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_portal jsonb;
  v_listing_id uuid;
  v_org_id uuid;
  v_leads jsonb;
  v_viewings jsonb;
begin
  if nullif(trim(p_token), '') is null or nullif(trim(p_access_token), '') is null then
    raise exception 'Seller authentication required.' using errcode = '42501';
  end if;
  v_portal := public.bridge_private_listing_seller_portal_core_payload(p_token, p_access_token, true);
  if v_portal is null or coalesce((v_portal->>'authRequired')::boolean, false) then
    raise exception 'Seller authentication required.' using errcode = '42501';
  end if;
  v_listing_id := (v_portal->'listing'->>'id')::uuid;
  select organisation_id into v_org_id from public.private_listings where id = v_listing_id;
  if v_listing_id is null or v_org_id is null then
    raise exception 'Listing unavailable.' using errcode = '42501';
  end if;

  with candidates as (
    select
      coalesce(nullif(lower(trim(to_jsonb(c)->>'email')), ''), nullif(lower(trim(to_jsonb(l)->>'email')), ''),
        nullif(lower(trim(to_jsonb(c)->>'phone')), ''), nullif(lower(trim(to_jsonb(l)->>'phone')), ''), l.lead_id::text) as identity_key,
      coalesce(i.created_at, l.created_at) as created_at,
      l.updated_at
    from public.leads l
    left join public.contacts c on c.contact_id = l.contact_id and c.organisation_id = v_org_id
    left join public.lead_listing_interests i on i.lead_id = l.lead_id and i.listing_id = v_listing_id and i.organisation_id = v_org_id
    where l.organisation_id = v_org_id and (
      i.interest_id is not null
      or to_jsonb(l)->>'listing_id' = v_listing_id::text
      or to_jsonb(l)->>'enquired_listing_id' = v_listing_id::text
      or to_jsonb(l)->>'unit_id' = v_listing_id::text
    )
  ), unique_leads as (
    select distinct on (identity_key) created_at, updated_at, identity_key
    from candidates order by identity_key, updated_at desc nulls last
  ), safe_leads as (
    select row_number() over (order by identity_key) as row_id, created_at, updated_at from unique_leads
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', 'lead-' || row_id, 'createdAt', created_at, 'updatedAt', updated_at)), '[]'::jsonb)
    into v_leads from safe_leads;

  select coalesce(jsonb_agg(jsonb_build_object(
    'status', case
      when lower(a.status) in ('accepted', 'confirmed') then 'confirmed'
      when lower(a.status) in ('canceled', 'cancelled') then 'cancelled'
      when lower(a.status) = 'completed' then 'completed'
      when lower(a.status) = 'declined' then 'declined'
      when lower(a.status) in ('no_show', 'no show') then 'no_show'
      when lower(a.status) like '%alternative%' or lower(a.status) like '%reschedule%' then 'reschedule_requested'
      when lower(a.status) = 'requested' then 'requested'
      else 'pending_approval' end,
    'proposed_date', coalesce(to_jsonb(a)->>'date', to_jsonb(a)->>'appointment_date', left(to_jsonb(a)->>'date_time', 10)),
    'proposed_time', coalesce(to_jsonb(a)->>'start_time', substring(to_jsonb(a)->>'date_time' from 12 for 5))
  )), '[]'::jsonb) into v_viewings
  from public.appointments a
  where a.organisation_id = v_org_id and a.listing_id::text = v_listing_id::text
    and lower(coalesce(a.appointment_type, '')) like '%view%';

  return jsonb_build_object('listingId', v_listing_id, 'leads', v_leads, 'viewings', v_viewings, 'updatedAt', now());
end;
$$;

revoke all on function public.bridge_seller_listing_overview_performance(text, text) from public;
grant execute on function public.bridge_seller_listing_overview_performance(text, text) to anon, authenticated;
commit;
