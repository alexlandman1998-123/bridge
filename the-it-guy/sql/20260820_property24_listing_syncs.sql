begin;

create table if not exists public.property24_listing_syncs (
  id uuid primary key default gen_random_uuid(),
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  environment text not null default 'exdev',
  agency_id integer not null,
  listing_number integer not null,
  external_status text not null default 'submitted',
  is_on_portal boolean not null default false,
  last_successful_sync_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  last_reasons jsonb not null default '[]'::jsonb,
  last_response_summary jsonb not null default '{}'::jsonb,
  last_payload_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property24_listing_syncs_environment_check
    check (environment in ('exdev', 'production')),
  constraint property24_listing_syncs_status_check
    check (external_status in ('submitted', 'on_portal', 'not_on_portal', 'failed', 'removed', 'paused')),
  constraint property24_listing_syncs_reasons_array_check
    check (jsonb_typeof(last_reasons) = 'array'),
  constraint property24_listing_syncs_response_object_check
    check (jsonb_typeof(last_response_summary) = 'object'),
  constraint property24_listing_syncs_payload_object_check
    check (jsonb_typeof(last_payload_summary) = 'object')
);

create unique index if not exists property24_listing_syncs_listing_environment_uidx
  on public.property24_listing_syncs(private_listing_id, environment);

create unique index if not exists property24_listing_syncs_number_environment_uidx
  on public.property24_listing_syncs(listing_number, environment);

create index if not exists property24_listing_syncs_private_listing_idx
  on public.property24_listing_syncs(private_listing_id);

create index if not exists property24_listing_syncs_updated_idx
  on public.property24_listing_syncs(updated_at desc);

create or replace function public.property24_listing_syncs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_property24_listing_syncs_updated_at on public.property24_listing_syncs;
create trigger trg_property24_listing_syncs_updated_at
before update on public.property24_listing_syncs
for each row execute function public.property24_listing_syncs_set_updated_at();

alter table public.property24_listing_syncs enable row level security;

comment on table public.property24_listing_syncs is
  'Backend-owned Property24 listing mapping and last sync state. RLS is enabled with no public mutation policies; service role writes this table.';

commit;
