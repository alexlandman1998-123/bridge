begin;

create extension if not exists "pgcrypto";

create table if not exists public.commercial_activity (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  activity_type text not null default 'note',
  title text,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint commercial_activity_entity_type_not_blank check (length(trim(entity_type)) > 0),
  constraint commercial_activity_type_not_blank check (length(trim(activity_type)) > 0)
);

create index if not exists commercial_activity_organisation_id_idx
  on public.commercial_activity (organisation_id);

create index if not exists commercial_activity_entity_idx
  on public.commercial_activity (entity_type, entity_id, created_at desc);

create index if not exists commercial_activity_type_idx
  on public.commercial_activity (activity_type);

alter table public.commercial_activity enable row level security;

drop policy if exists commercial_activity_member_access on public.commercial_activity;
create policy commercial_activity_member_access on public.commercial_activity
for all to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

grant select, insert, update, delete on public.commercial_activity to authenticated;

commit;
