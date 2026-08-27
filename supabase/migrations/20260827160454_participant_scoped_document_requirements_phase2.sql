begin;

alter table if exists public.document_requirement_instances
  add column if not exists participant_key text,
  add column if not exists participant_id uuid references public.transaction_participants(id) on delete set null,
  add column if not exists participant_role text,
  add column if not exists participant_name text;

drop index if exists public.document_requirement_instances_active_unique_idx;
create unique index if not exists document_requirement_instances_active_unique_idx
  on public.document_requirement_instances (
    context_type,
    context_id,
    document_definition_key,
    coalesce(requested_from_role, ''),
    coalesce(requested_from_contact_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(participant_key, '')
  )
  where status <> 'not_applicable';

create index if not exists document_requirement_instances_participant_idx
  on public.document_requirement_instances (transaction_id, participant_key)
  where participant_key is not null and status <> 'not_applicable';

alter table if exists public.transaction_document_requirements
  add column if not exists canonical_document_key text,
  add column if not exists participant_key text,
  add column if not exists participant_id uuid references public.transaction_participants(id) on delete set null,
  add column if not exists participant_role text,
  add column if not exists participant_name text;

update public.transaction_document_requirements
set canonical_document_key = document_key
where canonical_document_key is null;

drop index if exists public.transaction_document_requirements_active_signature_idx;
create unique index if not exists transaction_document_requirements_active_signature_idx
  on public.transaction_document_requirements (
    transaction_id,
    document_key,
    coalesce(requested_from, ''),
    visible_section,
    coalesce(participant_key, '')
  )
  where superseded_at is null;

create index if not exists transaction_document_requirements_participant_idx
  on public.transaction_document_requirements (transaction_id, participant_key, visible_section)
  where participant_key is not null and superseded_at is null;

alter table if exists public.transaction_required_documents
  add column if not exists canonical_document_key text,
  add column if not exists participant_key text,
  add column if not exists participant_id uuid references public.transaction_participants(id) on delete set null,
  add column if not exists participant_role text,
  add column if not exists participant_name text;

update public.transaction_required_documents
set canonical_document_key = document_key
where canonical_document_key is null;

create index if not exists transaction_required_documents_participant_idx
  on public.transaction_required_documents (transaction_id, participant_key)
  where participant_key is not null;

comment on column public.document_requirement_instances.participant_key is
  'Stable request subject such as purchaser:1 or purchaser:2. It separates otherwise identical requirements for different people.';
comment on column public.transaction_document_requirements.canonical_document_key is
  'Base canonical document type. participant_key supplies instance identity without changing the document taxonomy.';
comment on column public.transaction_required_documents.canonical_document_key is
  'Base legacy/canonical document type when document_key is participant-scoped for compatibility projection.';

notify pgrst, 'reload schema';

commit;
