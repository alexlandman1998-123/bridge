begin;

create index if not exists website_production_dark_launches_listing_idx
  on public.website_production_dark_launches (listing_id);
create index if not exists website_production_dark_launches_site_organisation_idx
  on public.website_production_dark_launches (website_site_id, organisation_id);
create index if not exists website_production_dark_launch_events_launch_organisation_idx
  on public.website_production_dark_launch_events (dark_launch_id, organisation_id);

commit;
