create or replace function public.listing_overview_performance(
  p_organisation_id uuid,
  p_listing_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
  v_current_start date := current_date - (greatest(1, least(coalesce(p_days, 30), 90)) - 1);
  v_previous_end date := current_date - greatest(1, least(coalesce(p_days, 30), 90));
  v_previous_start date := current_date - ((greatest(1, least(coalesce(p_days, 30), 90)) * 2) - 1);
  v_listing public.private_listings%rowtype;
  v_property24_connected boolean := false;
  v_property24_current_available boolean := false;
  v_property24_previous_available boolean := false;
  v_property24_current_views bigint := 0;
  v_property24_previous_views bigint := 0;
  v_property24_current_contacts bigint := 0;
  v_property24_last_synced_at timestamptz;
  v_website_connected boolean := false;
  v_website_current_views bigint := 0;
  v_website_previous_views bigint := 0;
  v_website_last_tracked_at timestamptz;
begin
  if auth.uid() is null or not public.bridge_is_active_member(p_organisation_id) then
    raise exception 'You do not have access to this organisation.' using errcode = '42501';
  end if;

  select listing.*
  into v_listing
  from public.private_listings listing
  where listing.id = p_listing_id
    and listing.organisation_id = p_organisation_id;

  if v_listing.id is null then
    raise exception 'Listing not found.' using errcode = 'P0002';
  end if;

  v_property24_connected := nullif(pg_catalog.trim(coalesce(v_listing.property24_reference, '')), '') is not null;

  select
    count(*) filter (where statistics.statistic_date between v_current_start and current_date) > 0,
    count(*) filter (where statistics.statistic_date between v_previous_start and v_previous_end) > 0,
    coalesce(sum(statistics.view_count) filter (where statistics.statistic_date between v_current_start and current_date), 0),
    coalesce(sum(statistics.view_count) filter (where statistics.statistic_date between v_previous_start and v_previous_end), 0),
    coalesce(sum(statistics.total_contact_leads) filter (where statistics.statistic_date between v_current_start and current_date), 0),
    max(statistics.synced_at)
  into
    v_property24_current_available,
    v_property24_previous_available,
    v_property24_current_views,
    v_property24_previous_views,
    v_property24_current_contacts,
    v_property24_last_synced_at
  from public.property24_listing_statistics_daily statistics
  where statistics.organisation_id = p_organisation_id
    and statistics.private_listing_id = p_listing_id
    and statistics.environment = 'production'
    and statistics.statistic_date between v_previous_start and current_date;

  select exists (
    select 1
    from public.website_listing_publications publication
    join public.website_sites site on site.id = publication.website_site_id
    where publication.listing_id = p_listing_id
      and site.organisation_id = p_organisation_id
      and publication.status = 'published'
      and site.status = 'published'
  ) into v_website_connected;

  select
    coalesce(sum(analytics.event_count) filter (where analytics.event_date between v_current_start and current_date), 0),
    coalesce(sum(analytics.event_count) filter (where analytics.event_date between v_previous_start and v_previous_end), 0),
    max(analytics.updated_at)
  into
    v_website_current_views,
    v_website_previous_views,
    v_website_last_tracked_at
  from public.website_analytics_daily analytics
  join public.website_sites site on site.id = analytics.website_site_id
  where analytics.listing_id = p_listing_id
    and analytics.event_type = 'listing_view'
    and analytics.event_date between v_previous_start and current_date
    and site.organisation_id = p_organisation_id;

  return jsonb_build_object(
    'windowDays', v_days,
    'generatedAt', now(),
    'property24', jsonb_build_object(
      'connected', v_property24_connected,
      'available', v_property24_current_available,
      'views', case when v_property24_current_available then v_property24_current_views else null end,
      'previousViews', case when v_property24_previous_available then v_property24_previous_views else null end,
      'portalContacts', case when v_property24_current_available then v_property24_current_contacts else null end,
      'lastSyncedAt', v_property24_last_synced_at
    ),
    'privateProperty', jsonb_build_object(
      'connected', nullif(pg_catalog.trim(coalesce(v_listing.private_property_reference, '')), '') is not null,
      'available', false,
      'views', null,
      'previousViews', null,
      'reason', 'Private Property view statistics are not available in the current Arch9 feed.'
    ),
    'website', jsonb_build_object(
      'connected', v_website_connected,
      'available', v_website_connected,
      'views', case when v_website_connected then v_website_current_views else null end,
      'previousViews', case when v_website_connected then v_website_previous_views else null end,
      'lastTrackedAt', v_website_last_tracked_at
    )
  );
end;
$$;

revoke all on function public.listing_overview_performance(uuid, uuid, integer) from public;
revoke all on function public.listing_overview_performance(uuid, uuid, integer) from anon;
revoke all on function public.listing_overview_performance(uuid, uuid, integer) from authenticated;
grant execute on function public.listing_overview_performance(uuid, uuid, integer) to authenticated;

comment on function public.listing_overview_performance(uuid, uuid, integer) is
  'Organisation-scoped listing performance for the sales listing overview. Portal contacts remain separate from canonical CRM lead counts.';
