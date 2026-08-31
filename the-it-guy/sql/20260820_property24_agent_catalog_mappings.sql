begin;

create table if not exists public.property24_accounts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  environment text not null default 'exdev',
  agency_id integer not null,
  enabled boolean not null default false,
  last_auth_check_at timestamptz,
  last_catalog_sync_at timestamptz,
  last_agent_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property24_accounts_environment_check
    check (environment in ('exdev', 'production')),
  constraint property24_accounts_org_environment_uidx
    unique (organisation_id, environment)
);

create table if not exists public.property24_agent_mappings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  environment text not null default 'exdev',
  agency_id integer not null,
  arch9_user_id uuid,
  property24_agent_id integer not null,
  source_reference text not null,
  email_snapshot text,
  first_name_snapshot text,
  last_name_snapshot text,
  mobile_snapshot text,
  match_type text not null default 'manual',
  confidence numeric(5, 4) not null default 1,
  status text not null default 'active',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property24_agent_mappings_environment_check
    check (environment in ('exdev', 'production')),
  constraint property24_agent_mappings_status_check
    check (status in ('active', 'needs_review', 'inactive')),
  constraint property24_agent_mappings_match_type_check
    check (match_type in ('manual', 'explicit', 'email', 'source_reference')),
  constraint property24_agent_mappings_confidence_check
    check (confidence >= 0 and confidence <= 1)
);

create unique index if not exists property24_agent_mappings_arch9_environment_uidx
  on public.property24_agent_mappings(arch9_user_id, environment)
  where arch9_user_id is not null and status = 'active';

create unique index if not exists property24_agent_mappings_p24_environment_uidx
  on public.property24_agent_mappings(property24_agent_id, environment, agency_id)
  where status = 'active';

create index if not exists property24_agent_mappings_org_idx
  on public.property24_agent_mappings(organisation_id, environment, agency_id);

create table if not exists public.property24_catalog_mappings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid,
  environment text not null default 'exdev',
  catalog_type text not null,
  local_key text not null,
  local_label text,
  property24_id integer not null,
  property24_label text,
  parent_context jsonb not null default '{}'::jsonb,
  match_type text not null default 'manual',
  confidence numeric(5, 4) not null default 1,
  status text not null default 'active',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property24_catalog_mappings_environment_check
    check (environment in ('exdev', 'production')),
  constraint property24_catalog_mappings_type_check
    check (catalog_type in ('country', 'province', 'city', 'suburb', 'property_type', 'listing_type')),
  constraint property24_catalog_mappings_status_check
    check (status in ('active', 'needs_review', 'inactive')),
  constraint property24_catalog_mappings_confidence_check
    check (confidence >= 0 and confidence <= 1),
  constraint property24_catalog_mappings_context_object_check
    check (jsonb_typeof(parent_context) = 'object')
);

create unique index if not exists property24_catalog_mappings_local_environment_uidx
  on public.property24_catalog_mappings(environment, catalog_type, local_key)
  where status = 'active';

create index if not exists property24_catalog_mappings_org_idx
  on public.property24_catalog_mappings(organisation_id, environment, catalog_type);

create or replace function public.property24_mappings_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_property24_accounts_updated_at on public.property24_accounts;
create trigger trg_property24_accounts_updated_at
before update on public.property24_accounts
for each row execute function public.property24_mappings_set_updated_at();

drop trigger if exists trg_property24_agent_mappings_updated_at on public.property24_agent_mappings;
create trigger trg_property24_agent_mappings_updated_at
before update on public.property24_agent_mappings
for each row execute function public.property24_mappings_set_updated_at();

drop trigger if exists trg_property24_catalog_mappings_updated_at on public.property24_catalog_mappings;
create trigger trg_property24_catalog_mappings_updated_at
before update on public.property24_catalog_mappings
for each row execute function public.property24_mappings_set_updated_at();

alter table public.property24_accounts enable row level security;
alter table public.property24_agent_mappings enable row level security;
alter table public.property24_catalog_mappings enable row level security;

comment on table public.property24_accounts is
  'Server-managed Property24 agency account configuration. Secrets are not stored here.';

comment on table public.property24_agent_mappings is
  'Maps Arch9 agents to Property24 agents per agency/environment.';

comment on table public.property24_catalog_mappings is
  'Maps Arch9 location/property taxonomy values to Property24 catalog ids.';

commit;
