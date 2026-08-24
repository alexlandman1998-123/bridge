create table if not exists public.prospect_demo_configs (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  agency_name text not null,
  logo_url text not null,
  primary_colour text not null,
  sample_property_image_url text,
  sample_property_address text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prospect_demo_configs_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index if not exists prospect_demo_configs_slug_idx
  on public.prospect_demo_configs (slug);

alter table public.prospect_demo_configs enable row level security;

create or replace function public.arch9_is_admin_user()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('founder', 'super_admin', 'platform_admin')
  ) or exists (
    select 1
    from public.organisation_users ou
    where ou.user_id = auth.uid()
      and ou.status = 'active'
      and (
        ou.role in ('founder', 'super_admin', 'admin', 'platform_admin')
        or ou.workspace_role in ('founder', 'super_admin', 'admin', 'platform_admin')
        or ou.organisation_role in ('founder', 'super_admin', 'admin', 'platform_admin')
        or ou.app_role in ('founder', 'super_admin', 'admin', 'platform_admin')
      )
  );
$$;

drop policy if exists prospect_demo_configs_public_read on public.prospect_demo_configs;
create policy prospect_demo_configs_public_read
  on public.prospect_demo_configs
  for select
  to anon, authenticated
  using (true);

drop policy if exists prospect_demo_configs_admin_write on public.prospect_demo_configs;
create policy prospect_demo_configs_admin_write
  on public.prospect_demo_configs
  for insert
  to authenticated
  with check (public.arch9_is_admin_user());

drop policy if exists prospect_demo_configs_admin_update on public.prospect_demo_configs;
create policy prospect_demo_configs_admin_update
  on public.prospect_demo_configs
  for update
  to authenticated
  using (public.arch9_is_admin_user())
  with check (public.arch9_is_admin_user());

drop policy if exists prospect_demo_configs_admin_delete on public.prospect_demo_configs;
create policy prospect_demo_configs_admin_delete
  on public.prospect_demo_configs
  for delete
  to authenticated
  using (public.arch9_is_admin_user());

grant select on public.prospect_demo_configs to anon, authenticated;
grant insert, update, delete on public.prospect_demo_configs to authenticated;
