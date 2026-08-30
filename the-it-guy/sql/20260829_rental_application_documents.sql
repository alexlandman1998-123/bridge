begin;
create table if not exists public.rental_application_documents (
  id uuid primary key default gen_random_uuid(), application_id uuid not null references public.rental_applications(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade, document_type text not null check (document_type in ('identity','proof_of_income','bank_statement','reference','other')),
  status text not null default 'uploaded' check (status in ('requested','uploaded','accepted','rejected')),
  storage_bucket text not null default 'rental-application-documents', storage_path text, file_name text, mime_type text, file_size_bytes bigint,
  review_note text, reviewed_by uuid references auth.users(id) on delete set null, reviewed_at timestamptz, uploaded_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists rental_application_documents_application_idx on public.rental_application_documents(application_id, document_type, created_at desc);
alter table public.rental_application_documents enable row level security;
revoke all on public.rental_application_documents from anon, authenticated;
grant select, insert, update on public.rental_application_documents to authenticated;
create policy rental_application_documents_staff_scope on public.rental_application_documents for all to authenticated using (exists (select 1 from public.rental_applications application join public.rental_vacancies vacancy on vacancy.id = application.vacancy_id join public.rental_properties property on property.id = vacancy.property_id where application.id = application_id and public.rental_branch_access(property.organisation_id, property.branch_id))) with check (exists (select 1 from public.rental_applications application join public.rental_vacancies vacancy on vacancy.id = application.vacancy_id join public.rental_properties property on property.id = vacancy.property_id where application.id = application_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
insert into storage.buckets(id,name,public) values ('rental-application-documents','rental-application-documents',false) on conflict(id) do nothing;
commit;
