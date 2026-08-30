begin;

create table if not exists public.rental_application_screening_checks (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.rental_applications(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  check_type text not null check (check_type in ('identity', 'fica', 'affordability', 'employment', 'reference')),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'passed', 'needs_review', 'failed', 'expired')),
  result_json jsonb not null default '{}'::jsonb,
  evidence_note text,
  expires_at date,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(application_id, check_type)
);

create index if not exists rental_application_screening_checks_application_idx on public.rental_application_screening_checks(application_id, status, updated_at desc);

create table if not exists public.rental_application_screening_check_history (
  id uuid primary key default gen_random_uuid(), screening_check_id uuid not null references public.rental_application_screening_checks(id) on delete cascade,
  application_id uuid not null references public.rental_applications(id) on delete cascade, organisation_id uuid not null references public.organisations(id) on delete cascade,
  from_status text, to_status text not null, evidence_note text, occurred_by uuid references auth.users(id) on delete set null, occurred_at timestamptz not null default now()
);
create index if not exists rental_application_screening_history_application_idx on public.rental_application_screening_check_history(application_id, occurred_at desc);

create or replace function public.rental_application_screening_validate_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare application_org uuid;
begin
  select organisation_id into application_org from public.rental_applications where id = new.application_id;
  if application_org is null or application_org <> new.organisation_id then raise exception 'Rental screening check must match application organisation'; end if;
  if new.status in ('passed', 'failed', 'needs_review', 'expired') then
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
  end if;
  return new;
end; $$;

create or replace function public.rental_application_screening_record_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status or new.evidence_note is distinct from old.evidence_note then
    insert into public.rental_application_screening_check_history(screening_check_id, application_id, organisation_id, from_status, to_status, evidence_note, occurred_by)
    values (new.id, new.application_id, new.organisation_id, case when tg_op = 'INSERT' then null else old.status end, new.status, new.evidence_note, auth.uid());
  end if;
  return new;
end; $$;
revoke execute on function public.rental_application_screening_record_history() from public, anon, authenticated;

drop trigger if exists trg_rental_application_screening_scope on public.rental_application_screening_checks;
create trigger trg_rental_application_screening_scope before insert or update on public.rental_application_screening_checks for each row execute function public.rental_application_screening_validate_scope();
drop trigger if exists trg_rental_application_screening_updated_at on public.rental_application_screening_checks;
create trigger trg_rental_application_screening_updated_at before update on public.rental_application_screening_checks for each row execute function public.rental_set_updated_at();
drop trigger if exists trg_rental_application_screening_history on public.rental_application_screening_checks;
create trigger trg_rental_application_screening_history after insert or update on public.rental_application_screening_checks for each row execute function public.rental_application_screening_record_history();

alter table public.rental_application_screening_checks enable row level security;
alter table public.rental_application_screening_check_history enable row level security;
revoke all on public.rental_application_screening_checks, public.rental_application_screening_check_history from anon, authenticated;
grant select, insert, update on public.rental_application_screening_checks to authenticated;
grant select on public.rental_application_screening_check_history to authenticated;
create policy rental_application_screening_checks_staff_scope on public.rental_application_screening_checks for all to authenticated using (exists (select 1 from public.rental_applications application join public.rental_vacancies vacancy on vacancy.id = application.vacancy_id join public.rental_properties property on property.id = vacancy.property_id where application.id = application_id and public.rental_branch_access(property.organisation_id, property.branch_id))) with check (exists (select 1 from public.rental_applications application join public.rental_vacancies vacancy on vacancy.id = application.vacancy_id join public.rental_properties property on property.id = vacancy.property_id where application.id = application_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
create policy rental_application_screening_history_staff_scope on public.rental_application_screening_check_history for select to authenticated using (exists (select 1 from public.rental_applications application join public.rental_vacancies vacancy on vacancy.id = application.vacancy_id join public.rental_properties property on property.id = vacancy.property_id where application.id = application_id and public.rental_branch_access(property.organisation_id, property.branch_id)));

commit;
