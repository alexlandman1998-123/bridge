begin;

alter table if exists public.commercial_deals
  add column if not exists vacancy_id uuid references public.commercial_vacancies(id) on delete set null;

alter table if exists public.commercial_heads_of_terms
  add column if not exists vacancy_id uuid references public.commercial_vacancies(id) on delete set null,
  add column if not exists sent_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists signed_at timestamptz,
  add column if not exists converted_at timestamptz;

alter table if exists public.commercial_leases
  add column if not exists heads_of_terms_id uuid references public.commercial_heads_of_terms(id) on delete set null,
  add column if not exists vacancy_id uuid references public.commercial_vacancies(id) on delete set null;

create index if not exists commercial_deals_vacancy_idx on public.commercial_deals (organisation_id, vacancy_id);
create index if not exists commercial_hots_workflow_idx on public.commercial_heads_of_terms (organisation_id, deal_id, status, signed_at, converted_at);
create index if not exists commercial_leases_workflow_idx on public.commercial_leases (organisation_id, deal_id, heads_of_terms_id, vacancy_id, status);

commit;
