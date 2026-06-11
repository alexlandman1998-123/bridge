begin;

create table if not exists public.organisation_modules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  module_key text not null,
  status text not null default 'active',
  source text not null default 'manual',
  enabled_by uuid references auth.users(id) on delete set null,
  enabled_at timestamptz,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz,
  disabled_by uuid references auth.users(id) on delete set null,
  disabled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_modules_unique_module unique (organisation_id, module_key),
  constraint organisation_modules_module_key_check check (module_key in ('commercial')),
  constraint organisation_modules_status_check check (status in ('active', 'requested', 'disabled')),
  constraint organisation_modules_source_check check (source in ('signup', 'principal_request', 'platform_admin', 'billing', 'settings_backfill', 'manual'))
);

create index if not exists organisation_modules_org_status_idx
  on public.organisation_modules (organisation_id, module_key, status);

drop trigger if exists trg_organisation_modules_updated_at on public.organisation_modules;
create trigger trg_organisation_modules_updated_at
before update on public.organisation_modules
for each row
execute function public.set_updated_at_timestamp();

insert into public.organisation_modules (
  organisation_id,
  module_key,
  status,
  source,
  enabled_at,
  metadata
)
select
  os.organisation_id,
  'commercial',
  'active',
  'settings_backfill',
  case
    when coalesce(os.settings_json #>> '{commercialWorkspace,enabledAt}', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      then (os.settings_json #>> '{commercialWorkspace,enabledAt}')::timestamptz
    else now()
  end,
  jsonb_build_object(
    'source', 'commercial_organisation_modules_phase3_backfill',
    'commercialWorkspace', coalesce(os.settings_json->'commercialWorkspace', '{}'::jsonb),
    'enabledModules', coalesce(os.settings_json->'enabledModules', '{}'::jsonb)
  )
from public.organisation_settings os
where coalesce(os.settings_json #>> '{commercialWorkspace,status}', '') = 'active'
   or coalesce(os.settings_json #>> '{enabledModules,commercial}', 'false') = 'true'
on conflict (organisation_id, module_key)
do update set
  status = case
    when public.organisation_modules.status = 'disabled' then public.organisation_modules.status
    else 'active'
  end,
  source = case
    when public.organisation_modules.status = 'disabled' then public.organisation_modules.source
    else excluded.source
  end,
  enabled_at = coalesce(public.organisation_modules.enabled_at, excluded.enabled_at),
  metadata = coalesce(public.organisation_modules.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

alter table public.organisation_modules enable row level security;

drop policy if exists organisation_modules_select_members on public.organisation_modules;
create policy organisation_modules_select_members
  on public.organisation_modules for select
  to authenticated
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists organisation_modules_insert_admins on public.organisation_modules;
create policy organisation_modules_insert_admins
  on public.organisation_modules for insert
  to authenticated
  with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists organisation_modules_update_admins on public.organisation_modules;
create policy organisation_modules_update_admins
  on public.organisation_modules for update
  to authenticated
  using (public.bridge_is_org_admin(organisation_id))
  with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists organisation_modules_delete_admins on public.organisation_modules;
create policy organisation_modules_delete_admins
  on public.organisation_modules for delete
  to authenticated
  using (public.bridge_is_org_admin(organisation_id));

grant select, insert, update, delete on public.organisation_modules to authenticated;

commit;
