begin;

-- This is an internal FICA/KYC workflow record, not a supplier payload store.
-- Identity numbers, document files, credit data and third-party KYC responses
-- must remain in the approved document/compliance systems, not this table.
create table public.knowledge_factory_fica_cases (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  prospect_id uuid references public.canvassing_prospects(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  subject_name text not null check (length(btrim(subject_name)) between 2 and 200),
  entity_type text not null default 'individual' check (entity_type in ('individual', 'company', 'trust')),
  status text not null default 'draft' check (status in ('draft', 'consent_captured', 'documents_requested', 'documents_received', 'review_required', 'approved', 'rejected', 'expired')),
  consent_captured_at timestamptz,
  consent_captured_by uuid references auth.users(id) on delete set null,
  consent_version text,
  document_checklist jsonb not null default '{"identity":"not_requested","proof_of_address":"not_requested","source_of_funds":"not_requested"}'::jsonb,
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  verification_provider_status text not null default 'not_configured' check (verification_provider_status in ('not_configured', 'ready_for_submission', 'submitted', 'completed', 'failed')),
  verification_reference text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_factory_fica_cases_checklist_object check (jsonb_typeof(document_checklist) = 'object'),
  constraint knowledge_factory_fica_cases_consent_check check (
    (status = 'draft' and consent_captured_at is null)
    or (status <> 'draft' and consent_captured_at is not null and consent_captured_by is not null)
  )
);

create index knowledge_factory_fica_cases_organisation_status_idx on public.knowledge_factory_fica_cases (organisation_id, status, created_at desc);
create index knowledge_factory_fica_cases_prospect_idx on public.knowledge_factory_fica_cases (prospect_id) where prospect_id is not null;

alter table public.knowledge_factory_fica_cases enable row level security;
revoke all on public.knowledge_factory_fica_cases from anon, authenticated;
grant select, insert, update on public.knowledge_factory_fica_cases to authenticated;

create policy knowledge_factory_fica_cases_read
on public.knowledge_factory_fica_cases for select to authenticated
using (
  created_by = (select auth.uid())
  or public.knowledge_factory_is_active_member(organisation_id, array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin'])
);

create policy knowledge_factory_fica_cases_insert
on public.knowledge_factory_fica_cases for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.knowledge_factory_is_active_member(organisation_id)
);

create policy knowledge_factory_fica_cases_update
on public.knowledge_factory_fica_cases for update to authenticated
using (
  created_by = (select auth.uid())
  or public.knowledge_factory_is_active_member(organisation_id, array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin'])
)
with check (
  created_by = (select auth.uid())
  or public.knowledge_factory_is_active_member(organisation_id, array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin'])
);

commit;
