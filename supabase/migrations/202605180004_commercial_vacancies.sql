begin;

create extension if not exists "pgcrypto";

create table if not exists public.commercial_vacancies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  status text not null default 'available',
  notes text,
  property_id uuid references public.commercial_properties(id) on delete cascade,
  landlord_id uuid references public.commercial_landlords(id) on delete set null,
  vacancy_name text not null,
  unit_or_floor text,
  available_area_m2 numeric,
  asking_rental numeric,
  availability_date date,
  broker_assignment uuid references auth.users(id) on delete set null,
  incentives text,
  fit_out_allowance numeric,
  constraint commercial_vacancies_name_not_blank check (length(trim(vacancy_name)) > 0)
);

create index if not exists commercial_vacancies_organisation_id_idx
  on public.commercial_vacancies (organisation_id);

create index if not exists commercial_vacancies_property_id_idx
  on public.commercial_vacancies (property_id);

create index if not exists commercial_vacancies_landlord_id_idx
  on public.commercial_vacancies (landlord_id);

create index if not exists commercial_vacancies_status_idx
  on public.commercial_vacancies (status);

create index if not exists commercial_vacancies_availability_date_idx
  on public.commercial_vacancies (availability_date);

drop trigger if exists trg_bridge_touch_commercial_vacancies_updated_at on public.commercial_vacancies;
create trigger trg_bridge_touch_commercial_vacancies_updated_at
before update on public.commercial_vacancies
for each row execute function public.bridge_touch_commercial_updated_at();

alter table public.commercial_vacancies enable row level security;

drop policy if exists commercial_vacancies_member_access on public.commercial_vacancies;
create policy commercial_vacancies_member_access on public.commercial_vacancies
for all to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

grant select, insert, update, delete on public.commercial_vacancies to authenticated;

commit;
