create table if not exists public.transaction_bond_originator_document_requests (
  id uuid primary key default gen_random_uuid(),
  export_package_id uuid not null references public.transaction_bond_application_export_packages(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  bond_application_id uuid references public.bond_applications(id) on delete set null,
  submission_id uuid references public.transaction_bond_application_submissions(id) on delete restrict,
  participant_id uuid references public.bond_application_participants(id) on delete set null,
  participant_key text,
  participant_role text,
  target_scope text not null default 'participant_documents',
  request_type text not null default 'supplemental_document',
  status text not null default 'sent',
  requirement_key text,
  canonical_document_type text,
  transaction_required_document_id uuid references public.transaction_required_documents(id) on delete set null,
  linked_document_id uuid references public.documents(id) on delete set null,
  requested_by uuid references public.profiles(id) on delete set null,
  buyer_instruction text not null,
  internal_note text,
  buyer_safe_feedback text,
  due_at timestamptz,
  sent_at timestamptz,
  first_viewed_at timestamptz,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz,
  submitted_for_review_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  withdrawn_at timestamptz,
  idempotency_key text,
  upload_idempotency_key text,
  requires_new_submission boolean not null default false,
  bank_workflow_unchanged boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_bond_originator_document_requests_type_check check (
    request_type in ('missing_document', 'replacement_document', 'supplemental_document')
  ),
  constraint transaction_bond_originator_document_requests_status_check check (
    status in (
      'draft',
      'sent',
      'viewed',
      'in_progress',
      'awaiting_review',
      'accepted',
      'rejected',
      'needs_more_information',
      'withdrawn',
      'cancelled'
    )
  ),
  constraint transaction_bond_originator_document_requests_scope_check check (
    target_scope in ('application_documents', 'participant_documents')
  ),
  constraint transaction_bond_originator_document_requests_supplemental_only_check check (
    requires_new_submission = false and bank_workflow_unchanged = true
  ),
  constraint transaction_bond_originator_document_requests_target_check check (
    canonical_document_type is not null
    or requirement_key is not null
    or transaction_required_document_id is not null
  )
);

create unique index if not exists transaction_bond_originator_document_requests_idempotency_idx
  on public.transaction_bond_originator_document_requests (export_package_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists transaction_bond_originator_document_requests_package_status_idx
  on public.transaction_bond_originator_document_requests (export_package_id, status, created_at desc);

create index if not exists transaction_bond_originator_document_requests_transaction_status_idx
  on public.transaction_bond_originator_document_requests (transaction_id, status, created_at desc);

create index if not exists transaction_bond_originator_document_requests_participant_status_idx
  on public.transaction_bond_originator_document_requests (participant_id, status, created_at desc)
  where participant_id is not null;

create index if not exists transaction_bond_originator_document_requests_requirement_idx
  on public.transaction_bond_originator_document_requests (transaction_required_document_id, status)
  where transaction_required_document_id is not null;

alter table public.transaction_bond_originator_document_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_document_requests'
      and policyname = 'bond_originator_document_requests_service_only'
  ) then
    create policy bond_originator_document_requests_service_only
      on public.transaction_bond_originator_document_requests
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

create or replace function public.bridge_touch_bond_originator_document_request()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_bond_originator_document_request on public.transaction_bond_originator_document_requests;
create trigger trg_touch_bond_originator_document_request
  before update on public.transaction_bond_originator_document_requests
  for each row execute function public.bridge_touch_bond_originator_document_request();

create or replace function public.bridge_record_bond_originator_document_request_upload(
  p_request_id uuid,
  p_document_id uuid,
  p_uploaded_by uuid default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_record public.transaction_bond_originator_document_requests%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role is required to record bond originator document request upload';
  end if;

  select * into request_record
  from public.transaction_bond_originator_document_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Bond originator document request not found';
  end if;

  if request_record.status in ('accepted', 'withdrawn', 'cancelled') then
    raise exception 'Bond originator document request is not open for upload';
  end if;

  if p_idempotency_key is not null
    and request_record.upload_idempotency_key = p_idempotency_key
    and request_record.linked_document_id = p_document_id then
    return request_record.id;
  end if;

  update public.transaction_bond_originator_document_requests
  set linked_document_id = p_document_id,
      uploaded_by = p_uploaded_by,
      uploaded_at = now(),
      submitted_for_review_at = now(),
      upload_idempotency_key = p_idempotency_key,
      status = 'awaiting_review'
  where id = p_request_id;

  return p_request_id;
end;
$$;

comment on table public.transaction_bond_originator_document_requests is
  'Phase 8B originator-requested missing, replacement or supplemental supporting documents. These requests do not mutate signed snapshots or bank workflow.';
comment on column public.transaction_bond_originator_document_requests.internal_note is
  'Internal originator note. Buyer-facing APIs must not expose this value.';
comment on column public.transaction_bond_originator_document_requests.requires_new_submission is
  'Always false for Phase 8B document-only requests. Application corrections remain Phase 7 revision/change-request work.';
comment on function public.bridge_record_bond_originator_document_request_upload(uuid, uuid, uuid, text) is
  'Service-only Phase 8B helper for linking an uploaded document to an originator document request without changing bank workflow.';
