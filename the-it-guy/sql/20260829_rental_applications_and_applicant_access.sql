-- Rentals Phases 21–23: persisted drafts and token-scoped public application access.
begin;
create table if not exists public.rental_applications (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  vacancy_id uuid not null references public.rental_vacancies(id) on delete restrict, unit_id uuid not null references public.rental_units(id) on delete restrict,
  applicant_party_id uuid, status text not null default 'draft' check (status in ('draft','submitted','under_review','approved','declined','withdrawn')),
  version integer not null default 1 check (version > 0), application_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists rental_applications_scope_idx on public.rental_applications(organisation_id, vacancy_id, status, updated_at desc);
create table if not exists public.rental_application_access_tokens (
  id uuid primary key default gen_random_uuid(), application_id uuid not null references public.rental_applications(id) on delete cascade,
  token_hash text not null unique, expires_at timestamptz not null, revoked_at timestamptz, last_accessed_at timestamptz, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create index if not exists rental_application_access_tokens_lookup_idx on public.rental_application_access_tokens(token_hash) where revoked_at is null;
create or replace function public.rental_application_validate_scope() returns trigger language plpgsql security invoker set search_path = '' as $$
declare vacancy_org uuid; vacancy_unit uuid;
begin
  select organisation_id, unit_id into vacancy_org, vacancy_unit from public.rental_vacancies where id = new.vacancy_id;
  if vacancy_org is null or vacancy_org <> new.organisation_id or vacancy_unit <> new.unit_id then raise exception 'Rental application must match its vacancy unit and organisation'; end if;
  if tg_op = 'UPDATE' and new.version <> old.version + 1 then raise exception 'Rental application version conflict'; end if;
  return new;
end; $$;
drop trigger if exists trg_rental_application_validate_scope on public.rental_applications;
create trigger trg_rental_application_validate_scope before insert or update on public.rental_applications for each row execute function public.rental_application_validate_scope();
drop trigger if exists trg_rental_applications_updated_at on public.rental_applications;
create trigger trg_rental_applications_updated_at before update on public.rental_applications for each row execute function public.rental_set_updated_at();
alter table public.rental_applications enable row level security; alter table public.rental_application_access_tokens enable row level security;
revoke all on public.rental_applications, public.rental_application_access_tokens from anon, authenticated;
grant select, insert, update on public.rental_applications to authenticated; grant select, insert, update on public.rental_application_access_tokens to authenticated;
create policy rental_applications_scoped on public.rental_applications for all to authenticated using (exists (select 1 from public.rental_vacancies vacancy join public.rental_properties property on property.id = vacancy.property_id where vacancy.id = vacancy_id and public.rental_branch_access(property.organisation_id, property.branch_id))) with check (exists (select 1 from public.rental_vacancies vacancy join public.rental_properties property on property.id = vacancy.property_id where vacancy.id = vacancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
create policy rental_application_access_tokens_scoped on public.rental_application_access_tokens for all to authenticated using (exists (select 1 from public.rental_applications application join public.rental_vacancies vacancy on vacancy.id = application.vacancy_id join public.rental_properties property on property.id = vacancy.property_id where application.id = application_id and public.rental_branch_access(property.organisation_id, property.branch_id))) with check (exists (select 1 from public.rental_applications application join public.rental_vacancies vacancy on vacancy.id = application.vacancy_id join public.rental_properties property on property.id = vacancy.property_id where application.id = application_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
commit;
