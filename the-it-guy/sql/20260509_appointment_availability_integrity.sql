-- Phase 4: appointment availability, resources, and scheduling integrity

create table if not exists public.appointment_resources (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  resource_name text not null,
  resource_type text not null default 'meeting_room',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.appointments add column if not exists resource_id uuid;
alter table if exists public.appointments add column if not exists allow_outside_business_hours boolean not null default false;
alter table if exists public.appointments add column if not exists scheduling_override_reason text;

alter table if exists public.appointments drop constraint if exists appointments_resource_fk;
alter table if exists public.appointments
  add constraint appointments_resource_fk
  foreign key (resource_id) references public.appointment_resources(id) on delete set null;

do $$
begin
  if to_regclass('public.appointments') is null then
    raise notice 'Skipping appointments_resource_idx because public.appointments does not exist yet.';
    return;
  end if;

  execute 'create index if not exists appointments_resource_idx on public.appointments (resource_id)';
end;
$$;

create index if not exists appointment_resources_org_idx on public.appointment_resources (organisation_id);
create index if not exists appointment_resources_active_idx on public.appointment_resources (organisation_id, is_active);
create index if not exists appointment_resources_type_idx on public.appointment_resources (resource_type);
