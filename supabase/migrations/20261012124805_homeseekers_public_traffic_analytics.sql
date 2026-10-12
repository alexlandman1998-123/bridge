-- New public-only aggregates are kept apart from historical unverified traffic.
-- Existing aggregate rows and other websites' RPCs remain unchanged.
create or replace function public.home_seekers_record_public_analytics_event(
  p_hostname text, p_event_type text, p_page_path text, p_listing_id uuid default null
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_site uuid := 'c2fcb2e4-23c1-4302-b490-7332f5075669';
  v_host text := lower(trim(coalesce(p_hostname, '')));
  v_type text := lower(trim(coalesce(p_event_type, '')));
  v_path text := trim(coalesce(p_page_path, ''));
  v_dimension text;
begin
  if v_host not in ('homeseeker.co.za','www.homeseeker.co.za')
    or v_type not in ('site_visit','page_view','listing_view','guarantee_opened','ppra_letter_opened')
    or v_path !~ '^/($|(guarantee|about|contact|selling|buying|renting|join)/?$|(properties|buying)/[0-9a-f-]{36}/?$)'
    or (v_type in ('guarantee_opened','ppra_letter_opened') and v_path not in ('/join','/join/')) then
    raise exception 'Invalid public Home Seekers event.' using errcode='22023';
  end if;
  if not exists(select 1 from public.website_domains d join public.website_sites s on s.id=d.website_site_id
    where d.website_site_id=v_site and d.hostname=v_host and d.status='active' and s.status='published'
      and s.organisation_id='2958d402-368e-43c9-b728-0098e10505f1') then
    raise exception 'Public Home Seekers domain unavailable.' using errcode='P0002';
  end if;
  if v_type='listing_view' then
    if p_listing_id is null or not exists(select 1 from public.website_listing_publications w
      where w.website_site_id=v_site and w.listing_id=p_listing_id and w.status='published') then
      raise exception 'Published Home Seekers listing not found.' using errcode='P0002';
    end if;
    v_dimension := 'listing:' || p_listing_id::text;
  else
    if p_listing_id is not null then raise exception 'Only listing views may identify a listing.' using errcode='22023'; end if;
    v_dimension := 'path:' || v_path;
  end if;
  -- Preserve recruitment's existing conversion-path contract.
  if v_type in ('guarantee_opened','ppra_letter_opened') then v_path := '/demo/homeseekers/join'; end if;
  insert into public.website_analytics_daily(website_site_id,event_date,event_type,page_path,dimension_key,listing_id,event_count)
  values(v_site,(now() at time zone 'Africa/Johannesburg')::date,v_type,v_path,
    'public-v1:' || v_host || ':' || v_dimension,p_listing_id,1)
  on conflict(website_site_id,event_date,event_type,page_path,dimension_key)
  do update set event_count=public.website_analytics_daily.event_count+1;
end;
$$;
revoke all on function public.home_seekers_record_public_analytics_event(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.home_seekers_record_public_analytics_event(text,text,text,uuid) to service_role;

create or replace function public.home_seekers_public_dashboard_analytics(p_website_site_id uuid,p_days integer default 30)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_days integer := greatest(1,least(coalesce(p_days,30),90));
  v_start date := (now() at time zone 'Africa/Johannesburg')::date - (greatest(1,least(coalesce(p_days,30),90))-1);
  v_end date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode='42501'; end if;
  if p_website_site_id <> 'c2fcb2e4-23c1-4302-b490-7332f5075669' or not exists(
    select 1 from public.website_sites s where s.id=p_website_site_id
      and s.organisation_id='2958d402-368e-43c9-b728-0098e10505f1'
      and public.bridge_has_organisation_membership(s.organisation_id)) then
    raise exception 'Not authorised for this website.' using errcode='42501';
  end if;
  return (with traffic as (
    select a.* from public.website_analytics_daily a where a.website_site_id=p_website_site_id
      and a.event_date between v_start and v_end
      and (a.dimension_key like 'public-v1:homeseeker.co.za:%' or a.dimension_key like 'public-v1:www.homeseeker.co.za:%')
  ), submissions as (
    select s.* from public.website_lead_submissions s where s.website_site_id=p_website_site_id
      and s.created_at >= (v_start::timestamp at time zone 'Africa/Johannesburg')
      and s.created_at < ((v_end+1)::timestamp at time zone 'Africa/Johannesburg')
      and s.attribution_json->>'publicHostname' in ('homeseeker.co.za','www.homeseeker.co.za')
      and s.attribution_json->>'publicTrackingVersion'='1'
  ) select jsonb_build_object(
    'windowDays',v_days,'trafficScope','homeseeker.co.za','timeZone','Africa/Johannesburg',
    'startDate',v_start,'endDate',v_end,'historicalTrafficExcluded',true,
    'trackingSince',(select min(created_at) from public.website_analytics_daily where website_site_id=p_website_site_id and dimension_key like 'public-v1:%'),
    'visits',(select coalesce(sum(event_count),0) from traffic where event_type='site_visit'),
    'pageViews',(select coalesce(sum(event_count),0) from traffic where event_type='page_view'),
    'listingViews',(select coalesce(sum(event_count),0) from traffic where event_type='listing_view'),
    'submissions',(select count(*) from submissions where status in ('received','routed','duplicate')),
    'leadsCreated',(select count(distinct lead_id) from submissions where status='routed' and lead_id is not null),
    'valuationRequests',(select count(*) from submissions where submission_type='valuation_request' and status in ('received','routed','duplicate')),
    'dailyTraffic',coalesce((select jsonb_agg(to_jsonb(d) order by d.date) from (
      select day::date as date,coalesce(sum(t.event_count) filter(where t.event_type='site_visit'),0) as visits,
        coalesce(sum(t.event_count) filter(where t.event_type='page_view'),0) as "pageViews"
      from pg_catalog.generate_series(v_start::timestamp,v_end::timestamp,interval '1 day') day
      left join traffic t on t.event_date=day::date group by day) d),'[]'::jsonb),
    'topPages',coalesce((select jsonb_agg(to_jsonb(p) order by p.views desc,p.label) from (
      select page_path as label,sum(event_count) as views from traffic where event_type='page_view' group by page_path order by views desc,page_path limit 5) p),'[]'::jsonb),
    'topListings',coalesce((select jsonb_agg(to_jsonb(l) order by l.views desc,l.label) from (
      select coalesce(nullif(p.title,''),'Property listing') as label,sum(t.event_count) as views from traffic t
      left join public.listing_publication_data p on p.listing_id=t.listing_id where t.event_type='listing_view'
      group by t.listing_id,p.title order by views desc,label limit 5) l),'[]'::jsonb),
    'dailySubmissions',coalesce((select jsonb_agg(to_jsonb(d) order by d.date) from (
      select (created_at at time zone 'Africa/Johannesburg')::date as date,count(*) as submissions from submissions
      where status in ('received','routed','duplicate') group by 1) d),'[]'::jsonb),
    'recentSubmissions',coalesce((select jsonb_agg(to_jsonb(s) order by s."createdAt" desc) from (
      select id,submission_type as "submissionType",status,created_at as "createdAt",lead_id as "leadId" from submissions order by created_at desc limit 8) s),'[]'::jsonb)
  ));
end;
$$;
revoke all on function public.home_seekers_public_dashboard_analytics(uuid,integer) from public,anon;
grant execute on function public.home_seekers_public_dashboard_analytics(uuid,integer) to authenticated;
