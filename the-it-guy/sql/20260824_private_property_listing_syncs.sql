begin;

create table if not exists public.private_property_listing_syncs (
  id uuid primary key default gen_random_uuid(),
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  environment text not null default 'sandbox',
  branch_guid uuid not null,
  property_id text not null,
  listing_type text not null default 'Sale',
  private_property_ref text,
  external_status text not null default 'submitted',
  is_on_portal boolean not null default false,
  last_event_type text,
  last_event_status text,
  last_event_description text,
  last_event_at timestamptz,
  continuation_key text,
  suburb_id integer,
  agent_ids jsonb not null default '[]'::jsonb,
  last_successful_sync_at timestamptz,
  submitted_at timestamptz,
  activated_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  last_response_summary jsonb not null default '{}'::jsonb,
  last_payload_summary jsonb not null default '{}'::jsonb,
  last_event_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_property_listing_syncs_environment_check
    check (environment in ('sandbox', 'production')),
  constraint private_property_listing_syncs_listing_type_check
    check (listing_type in ('Sale', 'Rental', 'Both', 'Unknown')),
  constraint private_property_listing_syncs_external_status_check
    check (external_status in ('submitted', 'active', 'inactive', 'failed', 'removed', 'paused', 'unknown')),
  constraint private_property_listing_syncs_agent_ids_array_check
    check (jsonb_typeof(agent_ids) = 'array'),
  constraint private_property_listing_syncs_response_object_check
    check (jsonb_typeof(last_response_summary) = 'object'),
  constraint private_property_listing_syncs_payload_object_check
    check (jsonb_typeof(last_payload_summary) = 'object'),
  constraint private_property_listing_syncs_event_object_check
    check (jsonb_typeof(last_event_summary) = 'object')
);

create unique index if not exists private_property_listing_syncs_listing_environment_uidx
  on public.private_property_listing_syncs(private_listing_id, environment);

create unique index if not exists private_property_listing_syncs_property_environment_uidx
  on public.private_property_listing_syncs(property_id, environment);

create unique index if not exists private_property_listing_syncs_ref_environment_uidx
  on public.private_property_listing_syncs(private_property_ref, environment)
  where private_property_ref is not null;

create index if not exists private_property_listing_syncs_private_listing_idx
  on public.private_property_listing_syncs(private_listing_id);

create index if not exists private_property_listing_syncs_status_idx
  on public.private_property_listing_syncs(external_status, updated_at desc);

create index if not exists private_property_listing_syncs_updated_idx
  on public.private_property_listing_syncs(updated_at desc);

create or replace function public.private_property_listing_syncs_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_private_property_listing_syncs_updated_at on public.private_property_listing_syncs;
create trigger trg_private_property_listing_syncs_updated_at
before update on public.private_property_listing_syncs
for each row execute function public.private_property_listing_syncs_set_updated_at();

alter table public.private_property_listing_syncs enable row level security;

grant select, insert, update, delete on public.private_property_listing_syncs to service_role;

comment on table public.private_property_listing_syncs is
  'Backend-owned Private Property listing mapping and last sync/event state. RLS is enabled with no public mutation policies; service role writes this table.';

comment on column public.private_property_listing_syncs.property_id is
  'The Arch9/Private Property unique listing ID sent as ListingImport.PropertyId.';

comment on column public.private_property_listing_syncs.private_property_ref is
  'The Private Property reference returned by GetReferenceNumberByListing or the activation event feed.';

commit;
