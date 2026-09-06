begin;

create index if not exists website_hypercare_windows_release_organisation_idx
  on public.website_hypercare_windows (release_id, organisation_id);
create index if not exists website_hypercare_windows_site_organisation_idx
  on public.website_hypercare_windows (website_site_id, organisation_id);

drop index if exists public.website_hypercare_daily_window_created_idx;
create index website_hypercare_daily_window_created_idx
  on public.website_hypercare_daily_observations (hypercare_window_id, organisation_id, observation_date desc);

drop index if exists public.website_hypercare_incidents_window_status_idx;
create index website_hypercare_incidents_window_status_idx
  on public.website_hypercare_incidents (hypercare_window_id, organisation_id, status, severity);

drop index if exists public.website_hypercare_events_window_created_idx;
create index website_hypercare_events_window_created_idx
  on public.website_hypercare_events (hypercare_window_id, organisation_id, created_at desc);

commit;
