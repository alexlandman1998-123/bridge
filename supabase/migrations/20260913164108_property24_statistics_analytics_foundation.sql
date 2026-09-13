begin;

create table public.property24_listing_statistics_daily (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  private_listing_id uuid references public.private_listings(id) on delete set null,
  environment text not null default 'production' check (environment in ('exdev', 'production')),
  agency_id integer not null check (agency_id > 0),
  listing_number bigint not null check (listing_number > 0),
  statistic_date date not null,
  source_api_version text not null check (source_api_version ~ '^v[0-9]+$'),
  view_count integer check (view_count is null or view_count >= 0),
  alert_count integer check (alert_count is null or alert_count >= 0),
  tel_leads integer check (tel_leads is null or tel_leads >= 0),
  sms_leads integer check (sms_leads is null or sms_leads >= 0),
  listing_contact_form_leads integer check (listing_contact_form_leads is null or listing_contact_form_leads >= 0),
  whatsapp_contact_form_leads integer check (whatsapp_contact_form_leads is null or whatsapp_contact_form_leads >= 0),
  total_leads integer check (total_leads is null or total_leads >= 0),
  total_contact_leads integer check (total_contact_leads is null or total_contact_leads >= 0),
  price numeric(14, 2),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property24_listing_statistics_daily_identity_uidx
    unique (organisation_id, environment, agency_id, listing_number, statistic_date)
);

create index property24_listing_statistics_daily_organisation_date_idx
  on public.property24_listing_statistics_daily (organisation_id, statistic_date desc);

create index property24_listing_statistics_daily_listing_date_idx
  on public.property24_listing_statistics_daily (organisation_id, private_listing_id, statistic_date desc)
  where private_listing_id is not null;

create index property24_listing_statistics_daily_agency_date_idx
  on public.property24_listing_statistics_daily (organisation_id, environment, agency_id, statistic_date desc);

create table public.property24_statistics_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  agency_id integer not null check (agency_id > 0),
  environment text not null default 'production' check (environment in ('exdev', 'production')),
  source_api_version text not null check (source_api_version ~ '^v[0-9]+$'),
  requested_from_date date,
  requested_to_date date,
  requested_by uuid references public.profiles(id) on delete set null,
  status text not null check (status in ('running', 'completed', 'partial', 'failed')),
  received_count integer not null default 0 check (received_count >= 0),
  stored_count integer not null default 0 check (stored_count >= 0),
  error_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(error_summary) = 'object'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint property24_statistics_sync_runs_date_window_check
    check (requested_from_date is null or requested_to_date is null or requested_from_date <= requested_to_date)
);

create index property24_statistics_sync_runs_organisation_started_idx
  on public.property24_statistics_sync_runs (organisation_id, started_at desc);

create index property24_statistics_sync_runs_agency_started_idx
  on public.property24_statistics_sync_runs (organisation_id, environment, agency_id, started_at desc);

create or replace function public.property24_listing_statistics_daily_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_property24_listing_statistics_daily_updated_at
before update on public.property24_listing_statistics_daily
for each row execute function public.property24_listing_statistics_daily_set_updated_at();

alter table public.property24_listing_statistics_daily enable row level security;
alter table public.property24_statistics_sync_runs enable row level security;

revoke all on public.property24_listing_statistics_daily from public, anon, authenticated;
revoke all on public.property24_statistics_sync_runs from public, anon, authenticated;
grant select on public.property24_listing_statistics_daily to authenticated;
grant select on public.property24_statistics_sync_runs to authenticated;

create policy property24_listing_statistics_daily_member_read
on public.property24_listing_statistics_daily
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

create policy property24_statistics_sync_runs_member_read
on public.property24_statistics_sync_runs
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

comment on table public.property24_listing_statistics_daily is
  'Daily, organisation-scoped Property24 listing statistics. Server-side syncs write this table; members may read only their own organisation aggregates.';

comment on table public.property24_statistics_sync_runs is
  'Organisation-scoped audit summary for Property24 statistics syncs. It contains no credentials or raw lead payloads.';

commit;
