begin;
alter table public.rental_applications add column if not exists submitted_at timestamptz, add column if not exists submitted_snapshot_json jsonb;
create table if not exists public.rental_application_consents (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.rental_applications(id) on delete cascade, organisation_id uuid not null references public.organisations(id) on delete cascade,
 consent_type text not null check (consent_type in ('privacy','credit_check','identity_verification')), wording_version text not null, accepted_at timestamptz not null default now(), source text not null default 'applicant' check (source in ('applicant','staff')), evidence_json jsonb not null default '{}'::jsonb, unique(application_id, consent_type, wording_version)
);
alter table public.rental_application_consents enable row level security;
revoke all on public.rental_application_consents from anon, authenticated;
grant select, insert on public.rental_application_consents to authenticated;
create policy rental_application_consents_staff_scope on public.rental_application_consents for all to authenticated using (exists (select 1 from public.rental_applications application join public.rental_vacancies vacancy on vacancy.id=application.vacancy_id join public.rental_properties property on property.id=vacancy.property_id where application.id=application_id and public.rental_branch_access(property.organisation_id,property.branch_id))) with check (exists (select 1 from public.rental_applications application join public.rental_vacancies vacancy on vacancy.id=application.vacancy_id join public.rental_properties property on property.id=vacancy.property_id where application.id=application_id and public.rental_branch_access(property.organisation_id,property.branch_id)));
commit;
