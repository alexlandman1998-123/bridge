-- Rentals Phase 12: operational vacancies, independent from shared listings.
-- Depends on property/unit/landlord mandate foundations; does not alter Sales tables.
begin;

create table if not exists public.rental_vacancies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  unit_id uuid not null references public.rental_units(id) on delete restrict,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  assigned_agent_id uuid references public.profiles(id) on delete set null,
  status text not null default 'draft',
  available_from date,
  asking_rent numeric(14,2) not null check (asking_rent >= 0),
  deposit_amount numeric(14,2) not null check (deposit_amount >= 0),
  lease_term_months integer check (lease_term_months is null or lease_term_months > 0),
  vacancy_reason text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_vacancies_status_check check (status in ('draft', 'preparing', 'marketing', 'applications_open', 'paused', 'let', 'withdrawn'))
);
create unique index if not exists rental_vacancies_one_open_unit_unique on public.rental_vacancies(unit_id) where status in ('draft', 'preparing', 'marketing', 'applications_open', 'paused');
create index if not exists rental_vacancies_org_branch_status_idx on public.rental_vacancies(organisation_id, branch_id, status, available_from, updated_at desc);
create index if not exists rental_vacancies_property_idx on public.rental_vacancies(property_id, updated_at desc);

create table if not exists public.rental_vacancy_status_history (
  id uuid primary key default gen_random_uuid(),
  vacancy_id uuid not null references public.rental_vacancies(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  from_status text,
  to_status text not null,
  occurred_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  constraint rental_vacancy_status_history_status_check check (to_status in ('draft', 'preparing', 'marketing', 'applications_open', 'paused', 'let', 'withdrawn'))
);
create index if not exists rental_vacancy_status_history_vacancy_idx on public.rental_vacancy_status_history(vacancy_id, occurred_at desc);

create or replace function public.rental_vacancy_validate_scope_and_transition()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare unit_org uuid; unit_property uuid; unit_branch uuid; ready boolean;
begin
  select organisation_id, property_id, branch_id into unit_org, unit_property, unit_branch from public.rental_units where id = new.unit_id;
  if unit_org is null or unit_org <> new.organisation_id or unit_property <> new.property_id then raise exception 'Rental vacancy must match its unit property and organisation'; end if;
  if new.branch_id is null then new.branch_id := unit_branch; end if;
  if unit_branch is not null and new.branch_id is distinct from unit_branch then raise exception 'Rental vacancy branch must match its unit'; end if;
  if tg_op = 'INSERT' and auth.uid() is not null and new.status <> 'draft' then raise exception 'Browser clients may only create a draft rental vacancy'; end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not ((old.status = 'draft' and new.status in ('preparing', 'withdrawn')) or (old.status = 'preparing' and new.status in ('draft', 'marketing', 'withdrawn')) or (old.status = 'marketing' and new.status in ('applications_open', 'paused', 'withdrawn')) or (old.status = 'applications_open' and new.status in ('paused', 'let', 'withdrawn')) or (old.status = 'paused' and new.status in ('preparing', 'marketing', 'applications_open', 'withdrawn'))) then raise exception 'Invalid rental vacancy transition'; end if;
  end if;
  if new.status = 'marketing' then
    select marketing_ready into ready from public.rental_property_marketing_readiness where property_id = new.property_id;
    if coalesce(ready, false) is not true then raise exception 'Rental vacancy cannot enter marketing until landlord and mandate readiness is confirmed'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_rental_vacancies_validate_scope on public.rental_vacancies;
create trigger trg_rental_vacancies_validate_scope before insert or update on public.rental_vacancies for each row execute function public.rental_vacancy_validate_scope_and_transition();
create or replace function public.rental_vacancy_record_status_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then insert into public.rental_vacancy_status_history(vacancy_id, organisation_id, from_status, to_status, occurred_by) values (new.id, new.organisation_id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then insert into public.rental_vacancy_status_history(vacancy_id, organisation_id, from_status, to_status, occurred_by) values (new.id, new.organisation_id, old.status, new.status, auth.uid()); end if;
  return new;
end; $$;
revoke execute on function public.rental_vacancy_record_status_history() from public, anon, authenticated;
drop trigger if exists trg_rental_vacancies_status_history on public.rental_vacancies;
create trigger trg_rental_vacancies_status_history after insert or update on public.rental_vacancies for each row execute function public.rental_vacancy_record_status_history();
drop trigger if exists trg_rental_vacancies_updated_at on public.rental_vacancies;
create trigger trg_rental_vacancies_updated_at before update on public.rental_vacancies for each row execute function public.rental_set_updated_at();

alter table public.rental_vacancies enable row level security;
alter table public.rental_vacancy_status_history enable row level security;
revoke all on public.rental_vacancies, public.rental_vacancy_status_history from anon, authenticated;
grant select, insert, update on public.rental_vacancies to authenticated;
grant select on public.rental_vacancy_status_history to authenticated;
drop policy if exists rental_vacancies_select_scoped on public.rental_vacancies;
create policy rental_vacancies_select_scoped on public.rental_vacancies for select to authenticated using (exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
drop policy if exists rental_vacancies_insert_scoped on public.rental_vacancies;
create policy rental_vacancies_insert_scoped on public.rental_vacancies for insert to authenticated with check (exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id) and (public.bridge_is_org_admin(property.organisation_id) or property.assigned_manager_id = (select auth.uid()) or property.created_by = (select auth.uid()))));
drop policy if exists rental_vacancies_update_scoped on public.rental_vacancies;
create policy rental_vacancies_update_scoped on public.rental_vacancies for update to authenticated using (exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id) and (public.bridge_is_org_admin(property.organisation_id) or property.assigned_manager_id = (select auth.uid()) or property.created_by = (select auth.uid())))) with check (exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id) and (public.bridge_is_org_admin(property.organisation_id) or property.assigned_manager_id = (select auth.uid()) or property.created_by = (select auth.uid()))));
drop policy if exists rental_vacancy_status_history_select_scoped on public.rental_vacancy_status_history;
create policy rental_vacancy_status_history_select_scoped on public.rental_vacancy_status_history for select to authenticated using (exists (select 1 from public.rental_vacancies vacancy join public.rental_properties property on property.id = vacancy.property_id where vacancy.id = vacancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
commit;
