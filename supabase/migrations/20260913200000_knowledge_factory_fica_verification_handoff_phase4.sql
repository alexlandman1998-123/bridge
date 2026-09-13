-- Phase 4: transaction-aware FICA verification handoff metadata.
-- Raw provider payloads are intentionally excluded from this table.

begin;

alter table public.knowledge_factory_fica_cases
  add column if not exists party_role text,
  add column if not exists lead_id uuid,
  add column if not exists transaction_id uuid references public.transactions(id) on delete set null,
  add column if not exists declaration_document_id uuid references public.documents(id) on delete set null,
  add column if not exists declaration_requirement_key text,
  add column if not exists document_readiness jsonb not null default '{}'::jsonb,
  add column if not exists provider_name text,
  add column if not exists provider_submitted_at timestamptz,
  add column if not exists provider_completed_at timestamptz,
  add column if not exists provider_check_statuses jsonb not null default '{}'::jsonb,
  add column if not exists provider_overall_status text,
  add column if not exists provider_result_expires_at timestamptz;

alter table public.knowledge_factory_fica_cases
  drop constraint if exists knowledge_factory_fica_cases_provider_status_check;
alter table public.knowledge_factory_fica_cases
  add constraint knowledge_factory_fica_cases_provider_status_check check (
    verification_provider_status in ('not_configured', 'integration_unavailable', 'ready', 'submitted', 'completed', 'review_required', 'failed')
  );

alter table public.knowledge_factory_fica_cases
  drop constraint if exists knowledge_factory_fica_cases_party_role_check;
alter table public.knowledge_factory_fica_cases
  add constraint knowledge_factory_fica_cases_party_role_check check (party_role is null or party_role in ('buyer', 'seller'));
alter table public.knowledge_factory_fica_cases
  drop constraint if exists knowledge_factory_fica_cases_document_readiness_object;
alter table public.knowledge_factory_fica_cases
  add constraint knowledge_factory_fica_cases_document_readiness_object check (jsonb_typeof(document_readiness) = 'object');
alter table public.knowledge_factory_fica_cases
  drop constraint if exists knowledge_factory_fica_cases_provider_check_statuses_object;
alter table public.knowledge_factory_fica_cases
  add constraint knowledge_factory_fica_cases_provider_check_statuses_object check (jsonb_typeof(provider_check_statuses) = 'object');

create index if not exists knowledge_factory_fica_cases_transaction_idx
  on public.knowledge_factory_fica_cases (transaction_id, created_at desc)
  where transaction_id is not null;
create index if not exists knowledge_factory_fica_cases_lead_idx
  on public.knowledge_factory_fica_cases (lead_id, created_at desc)
  where lead_id is not null;

comment on column public.knowledge_factory_fica_cases.document_readiness is
  'Normalized declaration and supporting-document readiness used to gate a provider request.';
comment on column public.knowledge_factory_fica_cases.provider_check_statuses is
  'Normalized provider check statuses only. Raw supplier payloads must remain at the server integration boundary.';

notify pgrst, 'reload schema';
commit;
