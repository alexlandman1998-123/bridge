begin;

create table if not exists public.private_property_agent_mappings (
  id uuid primary key default gen_random_uuid(),
  agency_config_id uuid not null references public.private_property_agency_configs(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  organisation_user_id uuid references public.organisation_users(id) on delete set null,
  arch9_user_id uuid references public.profiles(id) on delete set null,
  environment text not null default 'sandbox',
  private_property_agent_id text not null,
  source_reference text not null,
  email_snapshot text,
  first_name_snapshot text,
  last_name_snapshot text,
  mobile_snapshot text,
  image_url_snapshot text,
  is_default_for_branch boolean not null default false,
  is_default_for_organisation boolean not null default false,
  match_type text not null default 'manual',
  confidence numeric(5, 4) not null default 1,
  status text not null default 'active',
  last_synced_at timestamptz,
  last_verified_at timestamptz,
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_property_agent_mappings_environment_check
    check (environment in ('sandbox', 'production')),
  constraint private_property_agent_mappings_status_check
    check (status in ('active', 'needs_review', 'inactive', 'revoked')),
  constraint private_property_agent_mappings_match_type_check
    check (match_type in ('manual', 'explicit', 'email', 'source_reference', 'branch_default', 'organisation_default')),
  constraint private_property_agent_mappings_confidence_check
    check (confidence >= 0 and confidence <= 1),
  constraint private_property_agent_mappings_metadata_object_check
    check (jsonb_typeof(metadata_json) = 'object'),
  constraint private_property_agent_mappings_default_scope_check
    check (
      not (is_default_for_branch and branch_id is null)
      and not (is_default_for_branch and is_default_for_organisation)
      and not (is_default_for_organisation and arch9_user_id is not null)
      and not (is_default_for_organisation and branch_id is not null)
    ),
  constraint private_property_agent_mappings_source_reference_check
    check (length(trim(source_reference)) > 0),
  constraint private_property_agent_mappings_agent_id_check
    check (length(trim(private_property_agent_id)) > 0)
);

create unique index if not exists private_property_agent_mappings_arch9_user_uidx
  on public.private_property_agent_mappings(agency_config_id, environment, arch9_user_id)
  where arch9_user_id is not null and status = 'active';

create unique index if not exists private_property_agent_mappings_vendor_agent_uidx
  on public.private_property_agent_mappings(agency_config_id, environment, private_property_agent_id)
  where status = 'active';

create unique index if not exists private_property_agent_mappings_source_reference_uidx
  on public.private_property_agent_mappings(agency_config_id, environment, source_reference)
  where status = 'active';

create unique index if not exists private_property_agent_mappings_branch_default_uidx
  on public.private_property_agent_mappings(agency_config_id, environment, branch_id)
  where is_default_for_branch and status = 'active';

create unique index if not exists private_property_agent_mappings_org_default_uidx
  on public.private_property_agent_mappings(agency_config_id, environment, organisation_id)
  where is_default_for_organisation and status = 'active';

create index if not exists private_property_agent_mappings_org_idx
  on public.private_property_agent_mappings(organisation_id, branch_id, environment, status);

create index if not exists private_property_agent_mappings_email_idx
  on public.private_property_agent_mappings(agency_config_id, environment, lower(email_snapshot))
  where email_snapshot is not null and status = 'active';

create or replace function public.private_property_agent_mappings_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_private_property_agent_mappings_updated_at on public.private_property_agent_mappings;
create trigger trg_private_property_agent_mappings_updated_at
before update on public.private_property_agent_mappings
for each row execute function public.private_property_agent_mappings_set_updated_at();

alter table public.private_property_agent_mappings enable row level security;

revoke all on public.private_property_agent_mappings from public, anon, authenticated;
grant select, insert, update, delete on public.private_property_agent_mappings to service_role;
revoke all on function public.private_property_agent_mappings_set_updated_at() from public, anon, authenticated;

comment on table public.private_property_agent_mappings is
  'Server-managed mapping from Arch9 users/memberships to Private Property agent ids per agency config/environment. No portal credentials are stored here.';

comment on column public.private_property_agent_mappings.private_property_agent_id is
  'The AgentId value submitted to Private Property ListingImport for this mapped agent.';

comment on column public.private_property_agent_mappings.source_reference is
  'Stable Arch9-side reference used when creating/updating the Private Property agent record.';

commit;
