begin;

-- Builds on the authenticated seller metrics reader. Source counts contain no
-- buyer details and never accept a caller-supplied listing or organisation ID.
create or replace function public.bridge_seller_listing_marketing_performance(p_token text, p_access_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_metrics jsonb;
  v_listing_id uuid;
  v_org_id uuid;
  v_channels jsonb;
begin
  v_metrics := public.bridge_seller_listing_overview_performance(p_token, p_access_token);
  v_listing_id := (v_metrics->>'listingId')::uuid;
  select organisation_id into v_org_id from public.private_listings where id = v_listing_id;
  if v_listing_id is null or v_org_id is null then
    raise exception 'Listing unavailable.' using errcode = '42501';
  end if;

  with candidates as (
    select
      coalesce(nullif(lower(trim(to_jsonb(c)->>'email')), ''), nullif(lower(trim(to_jsonb(l)->>'email')), ''),
        nullif(lower(trim(to_jsonb(c)->>'phone')), ''), nullif(lower(trim(to_jsonb(l)->>'phone')), ''), l.lead_id::text) as identity_key,
      regexp_replace(lower(coalesce(nullif(to_jsonb(l)->>'lead_source', ''), nullif(to_jsonb(l)->>'source', ''), to_jsonb(l)->>'source_label', '')), '[^a-z0-9]', '', 'g') as source_key
    from public.leads l
    left join public.contacts c on c.contact_id = l.contact_id and c.organisation_id = v_org_id
    where l.organisation_id = v_org_id and (
      exists (select 1 from public.lead_listing_interests i where i.lead_id = l.lead_id and i.listing_id = v_listing_id and i.organisation_id = v_org_id)
      or to_jsonb(l)->>'listing_id' = v_listing_id::text
      or to_jsonb(l)->>'enquired_listing_id' = v_listing_id::text
      or to_jsonb(l)->>'unit_id' = v_listing_id::text
    )
  ), attributed as (
    select distinct identity_key, case
      when source_key like '%property24%' then 'property24'
      when source_key like '%privateproperty%' then 'privateProperty'
      when source_key in ('agencywebsite', 'website', 'agency', 'arch9website') then 'website'
      else 'other' end as channel
    from candidates
  )
  select jsonb_build_object(
    'property24', count(*) filter (where channel = 'property24'),
    'privateProperty', count(*) filter (where channel = 'privateProperty'),
    'website', count(*) filter (where channel = 'website'),
    'other', count(*) filter (where channel = 'other')
  ) into v_channels from attributed;

  return v_metrics || jsonb_build_object('channelLeads', v_channels);
end;
$$;

revoke all on function public.bridge_seller_listing_marketing_performance(text, text) from public;
grant execute on function public.bridge_seller_listing_marketing_performance(text, text) to anon, authenticated;
commit;
