begin;
-- Keep the original contract available for all saved version-1 drafts.
alter function public.marketing_listing_builder_valid(jsonb) rename to marketing_listing_builder_v1_valid;
create function public.marketing_listing_builder_valid(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb; settings jsonb; field text; setting jsonb; ids text[] := '{}'; count_items integer;
begin
  if value is null then return true; end if;
  if value->'version'='1'::jsonb then return public.marketing_listing_builder_v1_valid(value); end if;
  if jsonb_typeof(value)<>'object' or value->'version'<>'2'::jsonb or octet_length(value::text)>180000 then return false; end if;
  if not(value ?& array['version','template','listingId','agentId','source','settings','additionalListings']) or value->>'template' not in ('show-day','property-spotlight','price-reduced','coming-soon','property-collection','just-sold') then return false; end if;
  for field in select jsonb_object_keys(value) loop
    if field not in ('version','template','listingId','agentId','source','settings','additionalListings') then return false; end if;
  end loop;
  if jsonb_typeof(value->'additionalListings')<>'array' or jsonb_typeof(value->'settings')<>'object' then return false; end if;
  count_items:=jsonb_array_length(value->'additionalListings');
  if (value->>'template'='property-collection' and count_items not between 2 and 5) or (value->>'template'<>'property-collection' and count_items<>0) then return false; end if;
  for item in select jsonb_build_object('listingId',value->'listingId','agentId',value->'agentId','source',value->'source') union all select * from jsonb_array_elements(value->'additionalListings') loop
    if not public.marketing_listing_builder_v1_valid(item || '{"version":1,"template":"new-listing"}'::jsonb) or (item->>'listingId')=any(ids) then return false; end if;
    ids:=array_append(ids,item->>'listingId');
  end loop;
  settings:=value->'settings';
  for field,setting in select * from jsonb_each(settings) loop
    if field in ('eventId','date','startTime','endTime','feature') then
      if jsonb_typeof(setting)<>'string' or length(setting #>> '{}')>600 then return false; end if;
    elsif field in ('priceConfirmed','publicationConfirmed','revealTitle','revealPrice','revealFacts','revealPhotos') then
      if jsonb_typeof(setting)<>'boolean' then return false; end if;
    else return false; end if;
  end loop;
  if value->>'template'<>'property-spotlight' and coalesce(settings->>'feature','')<>'' then return false; end if;
  if value->>'template'<>'show-day' and (coalesce(settings->>'eventId','')<>'' or coalesce(settings->>'date','')<>'' or coalesce(settings->>'startTime','')<>'' or coalesce(settings->>'endTime','')<>'') then return false; end if;
  if coalesce(settings->>'eventId','')<>'' and settings->>'eventId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  if value->>'template'='show-day' then
    if coalesce(settings->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(settings->>'startTime','') !~ '^([01]\d|2[0-3]):[0-5]\d$' or coalesce(settings->>'endTime','') !~ '^([01]\d|2[0-3]):[0-5]\d$' or settings->>'endTime'<=settings->>'startTime' then return false; end if;
    begin perform (settings->>'date')::date; exception when others then return false; end;
  end if;
  if value->>'template'='price-reduced' and (settings->'priceConfirmed' is distinct from 'true'::jsonb or coalesce(value#>>'{source,price}','') !~ '^R\s*[0-9]') then return false; end if;
  if value->>'template' in ('coming-soon','just-sold') and settings->'publicationConfirmed' is distinct from 'true'::jsonb then return false; end if;
  if value->>'template'='coming-soon' then
    if (settings->'revealPhotos' is distinct from 'true'::jsonb and coalesce(value#>>'{source,imageId}','')<>'') or (settings->'revealPrice' is distinct from 'true'::jsonb and coalesce(value#>>'{source,price}','')<>'') or (settings->'revealFacts' is distinct from 'true'::jsonb and (coalesce(value#>>'{source,facts}','')<>'' or coalesce(value#>>'{source,description}','')<>'')) then return false; end if;
  end if;
  if value->>'template'='just-sold' and (coalesce(value#>>'{source,price}','')<>'' or coalesce(value#>>'{source,facts}','')<>'' or coalesce(value#>>'{source,description}','')<>'') then return false; end if;
  return true;
end $$;
revoke all on function public.marketing_listing_builder_valid(jsonb) from public,anon;
grant execute on function public.marketing_listing_builder_valid(jsonb) to authenticated,service_role;
alter table public.marketing_campaigns drop constraint marketing_listing_builder_valid;
alter table public.marketing_campaigns add constraint marketing_listing_builder_valid check (
  public.marketing_listing_builder_valid(listing_builder) and (listing_builder is null or (status='draft' and goal=case when listing_builder->>'template'='just-sold' then 'seller_leads' else 'promote_listing' end))
);
create or replace function public.marketing_campaign_listing_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare item jsonb; family text; settings jsonb;
begin
  if new.listing_builder is null then return new; end if;
  if not public.marketing_listing_builder_valid(new.listing_builder) then raise exception 'Invalid listing draft.' using errcode='22023'; end if;
  family:=new.listing_builder->>'template'; settings:=new.listing_builder->'settings';
  for item in select jsonb_build_object('listingId',new.listing_builder->'listingId','agentId',new.listing_builder->'agentId') union all select * from jsonb_array_elements(coalesce(new.listing_builder->'additionalListings','[]'::jsonb)) loop
    if not exists(select 1 from public.private_listings l where l.id=(item->>'listingId')::uuid and l.organisation_id=new.organisation_id
      and coalesce(l.assigned_agent_id::text,'')=item->>'agentId' and coalesce(l.listing_visibility,'')<>'deleted' and coalesce(l.listing_category,'')<>'rental'
      and case when family='just-sold' then l.listing_status='sold'
        when family='coming-soon' then l.listing_status in ('seller_lead','onboarding_sent','onboarding_completed','listing_review','mandate_ready','mandate_sent','mandate_signed')
        else coalesce(l.listing_status,'') not in ('sold','withdrawn','archived','deleted','under_offer','transaction_created') end
      and (l.assigned_agent_id=(select auth.uid()) or public.email_campaign_can_send(new.organisation_id))) then
      raise exception 'The listing or assigned agent changed or is no longer available in this agency.' using errcode='42501';
    end if;
  end loop;
  if family='show-day' then
    if ((settings->>'date') || 'T' || (settings->>'endTime') || ':00+02:00')::timestamptz<=now() then raise exception 'Choose a future show day.' using errcode='22023'; end if;
    if coalesce(settings->>'eventId','')<>'' and not exists(select 1 from public.marketing_events e where e.id=(settings->>'eventId')::uuid and e.organisation_id=new.organisation_id and e.subject_id::text=new.listing_builder->>'listingId' and e.subject_type='listing' and e.event_type='show_day' and e.status in ('upcoming','open') and e.metadata->>'visibility'='public'
      and to_char(e.starts_at at time zone 'Africa/Johannesburg','YYYY-MM-DD')=settings->>'date' and to_char(e.starts_at at time zone 'Africa/Johannesburg','HH24:MI')=settings->>'startTime' and to_char(e.ends_at at time zone 'Africa/Johannesburg','HH24:MI')=settings->>'endTime') then raise exception 'The public show day changed. Refresh it before saving.' using errcode='42501'; end if;
  end if;
  return new;
end $$;
notify pgrst,'reload schema';
commit;
