-- Use PostgreSQL btrim for the website event RPC; pg_catalog.trim does not exist.
-- Preserve the original event validation, site isolation, and service-role grant.
begin;

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
  v_host text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_hostname, '')));
  v_type text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_event_type, '')));
  v_path text := pg_catalog.left(pg_catalog.btrim(coalesce(p_page_path, '')), 2048);
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

commit;
