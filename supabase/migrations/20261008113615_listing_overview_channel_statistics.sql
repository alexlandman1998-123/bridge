begin;

create table public.private_property_listing_statistics_daily (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  environment text not null check (environment in ('production','sandbox')),
  branch_guid uuid not null,
  private_property_ref text not null check (length(private_property_ref) between 1 and 100),
  listing_type text not null check (listing_type in ('Sale','Rental','Both')),
  statistic_date date not null,
  view_count integer check (view_count >= 0),
  alert_count integer check (alert_count >= 0),
  message_count integer check (message_count >= 0),
  tel_leads integer check (tel_leads >= 0),
  synced_at timestamptz not null default now(),
  primary key (organisation_id, environment, branch_guid, private_property_ref, statistic_date)
);
create index private_property_statistics_listing_date_idx
  on public.private_property_listing_statistics_daily(organisation_id, private_listing_id, environment, statistic_date);

create table public.private_property_statistics_access (
  config_id uuid primary key references public.private_property_agency_configs(id) on delete cascade,
  scope_digest text not null,
  enabled boolean not null default false,
  verified_at timestamptz not null,
  last_scheduled_at timestamptz
);

create table public.private_property_statistics_sync_runs (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null references public.private_property_agency_configs(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  environment text not null check (environment in ('production','sandbox')),
  branch_guid uuid not null,
  requested_from_date date not null,
  requested_to_date date not null check (requested_to_date >= requested_from_date),
  status text not null check (status in ('running','completed','partial','failed')),
  stored_count integer not null default 0,
  request_count integer not null default 0,
  pending_count integer not null default 0,
  deferred_count integer not null default 0,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
-- Retry metadata is separate from source statistics: a pending day must not
-- create a synthetic daily statistics row or repeatedly block the backfill.
create table public.private_property_statistics_attempts (
  config_id uuid not null references public.private_property_agency_configs(id) on delete cascade,
  private_property_ref text not null,
  statistic_date date not null,
  retry_after_at timestamptz not null,
  primary key(config_id,private_property_ref,statistic_date)
);
create index private_property_statistics_runs_scope_idx
  on public.private_property_statistics_sync_runs(organisation_id, environment, started_at desc);

alter table public.private_property_listing_statistics_daily enable row level security;
alter table public.private_property_statistics_access enable row level security;
alter table public.private_property_statistics_sync_runs enable row level security;
alter table public.private_property_statistics_attempts enable row level security;
revoke all on public.private_property_statistics_attempts from public,anon,authenticated;
grant all on public.private_property_statistics_attempts to service_role;
revoke all on public.private_property_listing_statistics_daily, public.private_property_statistics_access, public.private_property_statistics_sync_runs from public, anon, authenticated;
grant all on public.private_property_listing_statistics_daily, public.private_property_statistics_access, public.private_property_statistics_sync_runs to service_role;
grant select on public.private_property_listing_statistics_daily, public.private_property_statistics_sync_runs to authenticated;
create policy private_property_statistics_member_read on public.private_property_listing_statistics_daily
  for select to authenticated using (public.bridge_is_active_member(organisation_id));
create policy private_property_statistics_runs_member_read on public.private_property_statistics_sync_runs
  for select to authenticated using (public.bridge_is_active_member(organisation_id));

create schema if not exists listing_statistics_private;
revoke all on schema listing_statistics_private from public, anon, authenticated;

create function listing_statistics_private.verify_private_property_statistics_owner()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.private_listings l join public.private_property_listing_syncs s on s.private_listing_id=l.id
    where l.id=new.private_listing_id and l.organisation_id=new.organisation_id
      and s.environment=new.environment and s.branch_guid=new.branch_guid
      and s.private_property_ref=new.private_property_ref and s.listing_type=new.listing_type) then
    raise exception 'Statistics listing mapping does not belong to the requested organisation and branch.' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger private_property_statistics_owner before insert or update on public.private_property_listing_statistics_daily
  for each row execute function listing_statistics_private.verify_private_property_statistics_owner();

-- Aggregate each metric independently. A missing field or day never becomes a
-- confirmed zero; metric values are subtotals until coverage is complete.
create function listing_statistics_private.channel_summary(p_rows jsonb, p_metrics text[], p_start date, p_end date, p_connected boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  metric text; value bigint; covered integer; expected integer := p_end-p_start+1;
  metrics jsonb := '{}'; metric_result jsonb; through_date date; synced_at timestamptz;
  previous_start date := p_start-expected; previous_end date := p_start-1;
  previous_views bigint; previous_days integer;
begin
  foreach metric in array p_metrics loop
    select sum((row->>metric)::bigint), count(distinct (row->>'date')::date)
      into value, covered from jsonb_array_elements(p_rows) row
      where (row->>'date')::date between p_start and p_end and row->>metric is not null;
    metric_result := jsonb_build_object('value',value,'available',covered>0,'complete',covered=expected,'coveredDays',covered,'expectedDays',expected);
    metrics := metrics || jsonb_build_object(metric,metric_result);
  end loop;
  select max((row->>'date')::date) filter (where (row->>'date')::date between p_start and p_end), max((row->>'syncedAt')::timestamptz)
    into through_date,synced_at from jsonb_array_elements(p_rows) row;
  select sum((row->>'views')::bigint),count(distinct (row->>'date')::date)
    into previous_views,previous_days from jsonb_array_elements(p_rows) row
    where (row->>'date')::date between previous_start and previous_end and row->>'views' is not null;
  return jsonb_build_object(
    'connected',p_connected,'available',coalesce((metrics->'views'->>'available')::boolean,false),
    'complete',coalesce((metrics->'views'->>'complete')::boolean,false),
    'views',metrics->'views'->'value','previousViews',case when previous_days=expected then previous_views else null end,
    'portalContacts',metrics->'portalContacts'->'value','metrics',metrics,'dataThrough',through_date,'lastSyncedAt',synced_at,
    'requestedStartDate',p_start,'requestedEndDate',p_end,
    'coverage',jsonb_build_object('coveredDays',coalesce((metrics->'views'->>'coveredDays')::integer,0),'expectedDays',expected,'kind','daily_rows'),
    'state',case when (metrics->'views'->>'complete')::boolean then 'complete' when (metrics->'views'->>'available')::boolean then 'partial' when p_connected then 'awaiting_statistics' else 'not_published' end,
    'sourceTimeZone','provider_calendar','timezoneAligned',false
  );
end; $$;
revoke all on all functions in schema listing_statistics_private from public, anon, authenticated;

create or replace function public.listing_overview_performance(p_organisation_id uuid, p_listing_id uuid, p_days integer default 30)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  days integer := greatest(1,least(coalesce(p_days,30),90));
  end_day date := (now() at time zone 'Africa/Johannesburg')::date-1;
  start_day date := end_day-days+1; previous_start date := start_day-days;
  listing public.private_listings%rowtype;
  rows jsonb; p24 jsonb; pp jsonb; website jsonb; attempt jsonb;
  site_mapped boolean; site_published boolean; enquiries bigint; tracked_at timestamptz;
  view_days integer; website_views bigint;
begin
  if auth.uid() is null or not public.bridge_is_active_member(p_organisation_id) then
    raise exception 'You do not have access to this organisation.' using errcode='42501';
  end if;
  select * into listing from public.private_listings where id=p_listing_id and organisation_id=p_organisation_id;
  if listing.id is null then raise exception 'Listing not found.' using errcode='P0002'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('date',statistic_date,'syncedAt',synced_at,'views',view_count,'alerts',alert_count,
    'portalContacts',total_contact_leads,'contactForms',listing_contact_form_leads,'whatsAppContacts',whatsapp_contact_form_leads,'phoneContacts',tel_leads,'smsContacts',sms_leads)),'[]')
    into rows from public.property24_listing_statistics_daily
    where organisation_id=p_organisation_id and private_listing_id=p_listing_id and environment='production' and statistic_date between previous_start and end_day;
  p24 := listing_statistics_private.channel_summary(rows,array['views','alerts','portalContacts','contactForms','whatsAppContacts','phoneContacts','smsContacts'],start_day,end_day,nullif(btrim(listing.property24_reference),'') is not null);
  p24 := p24 || jsonb_build_object('published',exists(select 1 from public.property24_listing_syncs s where s.private_listing_id=p_listing_id and s.environment='production' and s.is_on_portal));
  select jsonb_build_object('status',r.status,'at',r.started_at,'failed',r.status='failed') into attempt
    from public.property24_statistics_sync_runs r where r.organisation_id=p_organisation_id and r.environment='production'
      and exists(select 1 from public.property24_listing_syncs s where s.private_listing_id=p_listing_id and s.agency_id=r.agency_id and s.environment='production')
    order by r.started_at desc limit 1;
  p24 := p24 || jsonb_build_object('lastAttempt',attempt);

  select coalesce(jsonb_agg(jsonb_build_object('date',statistic_date,'syncedAt',synced_at,'views',view_count,'alerts',alert_count,'messages',message_count,'phoneContacts',tel_leads)),'[]')
    into rows from public.private_property_listing_statistics_daily
    where organisation_id=p_organisation_id and private_listing_id=p_listing_id and environment='production' and statistic_date between previous_start and end_day;
  pp := listing_statistics_private.channel_summary(rows,array['views','alerts','messages','phoneContacts'],start_day,end_day,nullif(btrim(listing.private_property_reference),'') is not null);
  pp := pp || jsonb_build_object('published',exists(select 1 from public.private_property_listing_syncs s where s.private_listing_id=p_listing_id and s.environment='production' and s.is_on_portal));
  attempt := null;
  select jsonb_build_object('status',r.status,'at',r.started_at,'failed',r.status='failed','pendingCount',r.pending_count,'deferredCount',r.deferred_count) into attempt
    from public.private_property_statistics_sync_runs r where r.organisation_id=p_organisation_id and r.environment='production'
      and exists(select 1 from public.private_property_listing_syncs s where s.private_listing_id=p_listing_id and s.branch_guid=r.branch_guid and s.environment='production')
    order by r.started_at desc limit 1;
  pp := pp || jsonb_build_object('lastAttempt',attempt);

  select count(*)>0,coalesce(bool_or(p.status='published' and s.status='published'),false)
    into site_mapped,site_published from public.website_listing_publications p join public.website_sites s on s.id=p.website_site_id
    where p.listing_id=p_listing_id and s.organisation_id=p_organisation_id;
  select sum(a.event_count) filter (where a.event_date between start_day and end_day),
    count(distinct a.event_date) filter (where a.event_date between start_day and end_day),max(a.updated_at)
    into website_views,view_days,tracked_at from public.website_analytics_daily a join public.website_sites s on s.id=a.website_site_id
    where a.listing_id=p_listing_id and s.organisation_id=p_organisation_id and a.event_type='listing_view' and a.event_date between previous_start and end_day;
  select count(distinct r.id) into enquiries from public.website_lead_submissions r join public.website_sites s on s.id=r.website_site_id
    where r.organisation_id=p_organisation_id and s.organisation_id=p_organisation_id and r.listing_id=p_listing_id
      and r.submission_type='property_enquiry' and r.status in ('received','routed','duplicate')
      and r.created_at >= (start_day::timestamp at time zone 'Africa/Johannesburg')
      and r.created_at < ((end_day+1)::timestamp at time zone 'Africa/Johannesburg');
  website := jsonb_build_object(
    'connected',site_mapped,'published',site_published,'available',website_views is not null,'complete',false,
    'views',website_views,'previousViews',null,'portalContacts',null,'lastSyncedAt',null,'lastTrackedAt',tracked_at,
    'requestedStartDate',start_day,'requestedEndDate',end_day,'dataThrough',null,
    'coverage',jsonb_build_object('coveredDays',view_days,'expectedDays',days,'kind','activity_only'),
    'state',case when website_views is not null then 'partial' when site_published then 'awaiting_statistics' else 'not_published' end,
    'reason','Website activity counts do not establish continuous tracking coverage.',
    'sourceTimeZone','database_calendar','timezoneAligned',false,
    'metrics',jsonb_build_object(
      'views',jsonb_build_object('value',website_views,'available',website_views is not null,'complete',false,'coveredDays',view_days,'expectedDays',days),
      'enquiries',jsonb_build_object('value',case when site_mapped or enquiries>0 then enquiries else null end,'available',site_mapped or enquiries>0,'complete',true,'kind','accepted_receipts'))
  );
  return jsonb_build_object('windowDays',days,'generatedAt',now(),'period',jsonb_build_object('startDate',start_day,'endDate',end_day,'days',days,'timeZone','Africa/Johannesburg','completedDaysOnly',true),
    'property24',p24,'privateProperty',pp,'website',website);
end; $$;
revoke all on function public.listing_overview_performance(uuid,uuid,integer) from public,anon;
grant execute on function public.listing_overview_performance(uuid,uuid,integer) to authenticated;
comment on function public.listing_overview_performance(uuid,uuid,integer) is 'Organisation-scoped completed-day listing statistics; source metrics and coverage remain distinct from CRM leads.';

commit;
