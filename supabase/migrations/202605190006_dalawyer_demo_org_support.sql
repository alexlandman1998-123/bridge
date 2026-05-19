begin;

alter table if exists public.organisations
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.organisation_users
  add column if not exists is_demo_data boolean not null default false;

create index if not exists organisations_demo_idx
  on public.organisations (name)
  where is_demo_data = true;

create index if not exists organisation_users_demo_idx
  on public.organisation_users (organisation_id, user_id)
  where is_demo_data = true;

commit;
