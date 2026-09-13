-- Privacy-conscious, aggregate-only website activity. No IP address, cookie,
-- fingerprint, user-agent, referrer, or visitor identifier is stored here.
create table public.website_analytics_daily (
  website_site_id uuid not null references public.website_sites(id) on delete cascade,
  event_date date not null default current_date,
  event_type text not null check (event_type in ('site_visit', 'page_view', 'listing_view')),
  page_path text not null check (page_path ~ '^/[^[:space:]]*$'),
  dimension_key text not null,
  listing_id uuid references public.private_listings(id) on delete set null,
  event_count integer not null default 1 check (event_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (website_site_id, event_date, event_type, page_path, dimension_key)
);

create index website_analytics_daily_site_date_idx
  on public.website_analytics_daily (website_site_id, event_date desc);
create index website_analytics_daily_listing_idx
  on public.website_analytics_daily (website_site_id, listing_id, event_date desc)
  where listing_id is not null;

alter table public.website_analytics_daily enable row level security;
revoke all on table public.website_analytics_daily from public, anon, authenticated;
grant select, insert, update on table public.website_analytics_daily to service_role;

create trigger trg_website_analytics_daily_updated_at
before update on public.website_analytics_daily
for each row execute function public.set_updated_at_timestamp();

create or replace function public.website_record_analytics_event(
  p_hostname text,
  p_event_type text,
  p_page_path text,
  p_listing_id uuid default null
)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_site_id uuid;
  v_host text := pg_catalog.lower(pg_catalog.trim(coalesce(p_hostname, '')));
  v_type text := pg_catalog.lower(pg_catalog.trim(coalesce(p_event_type, '')));
  v_path text := pg_catalog.left(pg_catalog.trim(coalesce(p_page_path, '')), 2048);
  v_dimension text;
begin
  if v_host !~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
    or v_type not in ('site_visit', 'page_view', 'listing_view')
    or v_path !~ '^/[^[:space:]]*$' then
    raise exception 'Invalid website analytics event.' using errcode = '22023';
  end if;

  select site.id into v_site_id
  from public.website_domains domain
  join public.website_sites site on site.id = domain.website_site_id
  where pg_catalog.lower(domain.hostname) = v_host
    and domain.status = 'active'
    and site.status = 'published'
  order by domain.is_primary desc, domain.created_at
  limit 1;

  if v_site_id is null then
    raise exception 'Published website not found.' using errcode = 'P0002';
  end if;

  if v_type = 'listing_view' then
    if p_listing_id is null or not exists (
      select 1 from public.website_listing_publications publication
      where publication.website_site_id = v_site_id
        and publication.listing_id = p_listing_id
        and publication.status = 'published'
    ) then
      raise exception 'Published website listing not found.' using errcode = 'P0002';
    end if;
    v_dimension := 'listing:' || p_listing_id::text;
  else
    if p_listing_id is not null then
      raise exception 'Only listing views may identify a listing.' using errcode = '22023';
    end if;
    v_dimension := 'path:' || v_path;
  end if;

  insert into public.website_analytics_daily (
    website_site_id, event_date, event_type, page_path, dimension_key, listing_id, event_count
  ) values (
    v_site_id, current_date, v_type, v_path, v_dimension, p_listing_id, 1
  ) on conflict (website_site_id, event_date, event_type, page_path, dimension_key)
  do update set event_count = public.website_analytics_daily.event_count + 1;
end;
$$;

revoke all on function public.website_record_analytics_event(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.website_record_analytics_event(text, text, text, uuid) to service_role;

-- Enrich the Phase 2 dashboard with aggregate activity, still keeping all
-- raw lead-form payloads and raw web request data inaccessible.
create or replace function public.website_dashboard_analytics(
  p_website_site_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_site public.website_sites%rowtype;
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
  v_since timestamptz := pg_catalog.date_trunc('day', pg_catalog.now()) - ((greatest(1, least(coalesce(p_days, 30), 90)) - 1) * interval '1 day');
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select site.* into v_site from public.website_sites site where site.id = p_website_site_id;
  if v_site.id is null or not public.bridge_has_organisation_membership(v_site.organisation_id) then raise exception 'Not authorised for this website.' using errcode = '42501'; end if;

  return pg_catalog.jsonb_build_object(
    'windowDays', v_days,
    'visits', (select coalesce(sum(event_count), 0) from public.website_analytics_daily where website_site_id = v_site.id and event_date >= v_since::date and event_type = 'site_visit'),
    'pageViews', (select coalesce(sum(event_count), 0) from public.website_analytics_daily where website_site_id = v_site.id and event_date >= v_since::date and event_type = 'page_view'),
    'listingViews', (select coalesce(sum(event_count), 0) from public.website_analytics_daily where website_site_id = v_site.id and event_date >= v_since::date and event_type = 'listing_view'),
    'submissions', (select count(*) from public.website_lead_submissions where website_site_id = v_site.id and created_at >= v_since and status in ('received', 'routed', 'duplicate')),
    'leadsCreated', (select count(distinct lead_id) from public.website_lead_submissions where website_site_id = v_site.id and created_at >= v_since and lead_id is not null and status = 'routed'),
    'valuationRequests', (select count(*) from public.website_lead_submissions where website_site_id = v_site.id and created_at >= v_since and submission_type = 'valuation_request' and status in ('received', 'routed', 'duplicate')),
    'dailyTraffic', coalesce((select jsonb_agg(jsonb_build_object('date', daily.event_date, 'visits', daily.visits, 'pageViews', daily.page_views) order by daily.event_date) from (select event_date, coalesce(sum(event_count) filter (where event_type = 'site_visit'), 0) as visits, coalesce(sum(event_count) filter (where event_type = 'page_view'), 0) as page_views from public.website_analytics_daily where website_site_id = v_site.id and event_date >= v_since::date group by event_date) daily), '[]'::jsonb),
    'topPages', coalesce((select jsonb_agg(jsonb_build_object('label', ranked.page_path, 'views', ranked.views) order by ranked.views desc, ranked.page_path) from (select page_path, sum(event_count) as views from public.website_analytics_daily where website_site_id = v_site.id and event_date >= v_since::date and event_type = 'page_view' group by page_path order by views desc, page_path limit 5) ranked), '[]'::jsonb),
    'topListings', coalesce((select jsonb_agg(jsonb_build_object('label', ranked.label, 'views', ranked.views) order by ranked.views desc, ranked.label) from (select coalesce(nullif(publication.title, ''), 'Property listing') as label, sum(analytics.event_count) as views from public.website_analytics_daily analytics left join public.listing_publication_data publication on publication.listing_id = analytics.listing_id where analytics.website_site_id = v_site.id and analytics.event_date >= v_since::date and analytics.event_type = 'listing_view' group by 1 order by 2 desc, 1 limit 5) ranked), '[]'::jsonb),
    'dailySubmissions', coalesce((select jsonb_agg(jsonb_build_object('date', daily.day, 'submissions', daily.submissions) order by daily.day) from (select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*) as submissions from public.website_lead_submissions where website_site_id = v_site.id and created_at >= v_since and status in ('received', 'routed', 'duplicate') group by 1) daily), '[]'::jsonb),
    'recentSubmissions', coalesce((select jsonb_agg(jsonb_build_object('id', recent.id, 'submissionType', recent.submission_type, 'status', recent.status, 'createdAt', recent.created_at, 'leadId', recent.lead_id) order by recent.created_at desc) from (select id, submission_type, status, created_at, lead_id from public.website_lead_submissions where website_site_id = v_site.id and created_at >= v_since order by created_at desc limit 8) recent), '[]'::jsonb)
  );
end;
$$;
