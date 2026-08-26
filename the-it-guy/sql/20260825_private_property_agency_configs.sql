begin;

create table if not exists public.private_property_agency_configs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete cascade,
  environment text not null default 'sandbox',
  vendor_name text not null default 'Arch9',
  branch_guid uuid not null,
  username_secret_name text not null,
  password_secret_name text not null,
  base_url text,
  enabled boolean not null default false,
  status text not null default 'pending',
  go_live_approved_at timestamptz,
  go_live_approved_by uuid references auth.users(id) on delete set null,
  last_auth_check_at timestamptz,
  last_publish_check_at timestamptz,
  last_event_feed_check_at timestamptz,
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_property_agency_configs_environment_check
    check (environment in ('sandbox', 'production')),
  constraint private_property_agency_configs_status_check
    check (status in ('pending', 'sandbox_ready', 'approved', 'active', 'disabled', 'revoked')),
  constraint private_property_agency_configs_secret_names_check
    check (
      username_secret_name !~* '(password|pass|pwd|token|key|secret)'
      and password_secret_name ~* '(password|pass|pwd|secret)'
      and username_secret_name <> password_secret_name
    ),
  constraint private_property_agency_configs_metadata_object_check
    check (jsonb_typeof(metadata_json) = 'object')
);

create unique index if not exists private_property_agency_configs_branch_environment_uidx
  on public.private_property_agency_configs(organisation_id, branch_id, environment)
  where branch_id is not null;

create unique index if not exists private_property_agency_configs_org_default_environment_uidx
  on public.private_property_agency_configs(organisation_id, environment)
  where branch_id is null;

create unique index if not exists private_property_agency_configs_guid_environment_uidx
  on public.private_property_agency_configs(branch_guid, environment);

create index if not exists private_property_agency_configs_org_idx
  on public.private_property_agency_configs(organisation_id, environment, enabled);

create index if not exists private_property_agency_configs_branch_idx
  on public.private_property_agency_configs(branch_id, environment)
  where branch_id is not null;

create or replace function public.private_property_agency_configs_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_private_property_agency_configs_updated_at on public.private_property_agency_configs;
create trigger trg_private_property_agency_configs_updated_at
before update on public.private_property_agency_configs
for each row execute function public.private_property_agency_configs_set_updated_at();

alter table public.private_property_agency_configs enable row level security;

revoke all on public.private_property_agency_configs from public, anon, authenticated;
grant select, insert, update, delete on public.private_property_agency_configs to service_role;
revoke all on function public.private_property_agency_configs_set_updated_at() from public, anon, authenticated;

comment on table public.private_property_agency_configs is
  'Backend-owned Private Property agency/branch configuration. Stores secret names only; raw usernames/passwords remain in runtime secret storage.';

comment on column public.private_property_agency_configs.branch_guid is
  'Private Property branch GUID issued during onboarding for this Arch9 organisation/branch/environment.';

comment on column public.private_property_agency_configs.username_secret_name is
  'Runtime secret name containing the Private Property username. The username value is not stored in this table.';

comment on column public.private_property_agency_configs.password_secret_name is
  'Runtime secret name containing the Private Property password. The password value is never stored in this table.';

commit;
