begin;
create extension if not exists "pgcrypto";
create table if not exists public.organisation_branding (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  organisation_display_name text,
  logo_light_url text,
  logo_dark_url text,
  primary_brand_color text,
  secondary_brand_color text,
  accent_brand_color text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.organisation_branding
  add column if not exists organisation_display_name text,
  add column if not exists primary_brand_color text,
  add column if not exists secondary_brand_color text,
  add column if not exists accent_brand_color text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;
create index if not exists organisation_branding_updated_at_idx
  on public.organisation_branding (updated_at desc);
create or replace function public.bridge_touch_organisation_branding_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_bridge_touch_organisation_branding_updated_at on public.organisation_branding;
create trigger trg_bridge_touch_organisation_branding_updated_at
before update on public.organisation_branding
for each row
execute function public.bridge_touch_organisation_branding_updated_at();
alter table public.organisation_branding enable row level security;
drop policy if exists organisation_branding_agency_select on public.organisation_branding;
create policy organisation_branding_agency_select on public.organisation_branding
for select to authenticated
using (public.bridge_is_active_member(organisation_id));
drop policy if exists organisation_branding_agency_insert on public.organisation_branding;
create policy organisation_branding_agency_insert on public.organisation_branding
for insert to authenticated
with check (public.bridge_is_org_admin(organisation_id));
drop policy if exists organisation_branding_agency_update on public.organisation_branding;
create policy organisation_branding_agency_update on public.organisation_branding
for update to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));
drop policy if exists organisation_branding_agency_delete on public.organisation_branding;
create policy organisation_branding_agency_delete on public.organisation_branding
for delete to authenticated
using (public.bridge_is_org_admin(organisation_id));
insert into public.organisation_branding (
  organisation_id,
  organisation_display_name,
  metadata_json
)
select
  org.id,
  coalesce(nullif(trim(org.name), ''), 'Bridge Organisation'),
  jsonb_build_object('source', 'migration_default')
from public.organisations org
where not exists (
  select 1
  from public.organisation_branding branding
  where branding.organisation_id = org.id
);
grant select, insert, update, delete on public.organisation_branding to authenticated;
commit;
