begin;

alter table if exists public.commercial_documents
  add column if not exists version_number integer not null default 1,
  add column if not exists supersedes_document_id uuid references public.commercial_documents(id) on delete set null,
  add column if not exists expires_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table if exists public.commercial_document_requests
  add column if not exists priority text not null default 'normal',
  add column if not exists requested_by uuid references auth.users(id) on delete set null,
  add column if not exists completed_document_id uuid references public.commercial_documents(id) on delete set null;

create index if not exists commercial_documents_workflow_idx
  on public.commercial_documents (organisation_id, entity_type, entity_id, category, status, version_number);

create index if not exists commercial_documents_expiry_idx
  on public.commercial_documents (organisation_id, expires_at)
  where expires_at is not null;

create index if not exists commercial_document_requests_workflow_idx
  on public.commercial_document_requests (organisation_id, entity_type, entity_id, category, status, priority, due_date);

commit;
