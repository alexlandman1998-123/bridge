begin;

-- Depends on 20261023132334_marketing_property_campaign_builders.sql.
-- marketing_events has always used planning/upcoming for active public events
-- (20260901165146 foundation and 20260901165150 RSVP). Keep all listing,
-- tenant, ownership, visibility and exact-time checks unchanged.
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
    if coalesce(settings->>'eventId','')<>'' and not exists(select 1 from public.marketing_events e where e.id=(settings->>'eventId')::uuid and e.organisation_id=new.organisation_id and e.subject_id::text=new.listing_builder->>'listingId' and e.subject_type='listing' and e.event_type='show_day' and e.status in ('planning','upcoming') and e.metadata->>'visibility'='public'
      and to_char(e.starts_at at time zone 'Africa/Johannesburg','YYYY-MM-DD')=settings->>'date' and to_char(e.starts_at at time zone 'Africa/Johannesburg','HH24:MI')=settings->>'startTime' and to_char(e.ends_at at time zone 'Africa/Johannesburg','HH24:MI')=settings->>'endTime') then raise exception 'The public show day changed. Refresh it before saving.' using errcode='42501'; end if;
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
commit;
