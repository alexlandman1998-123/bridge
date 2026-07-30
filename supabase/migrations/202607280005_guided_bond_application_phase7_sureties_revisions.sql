create extension if not exists pgcrypto with schema public;

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.bond_applications'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%'
    and pg_get_constraintdef(oid) like '%ready_for_review%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.bond_applications drop constraint %I', constraint_name);
  end if;

  alter table public.bond_applications
    add constraint bond_applications_status_phase7_check check (
      status in (
        'draft',
        'awaiting_participants',
        'ready_for_review',
        'preparing_submission',
        'awaiting_signatures',
        'submitted',
        'changes_requested',
        'revision_in_progress',
        'revision_under_review',
        'ready_for_re_review',
        'awaiting_revised_signatures',
        'cancelled'
      )
    );
end $$;

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.bond_application_participants'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%role%'
    and pg_get_constraintdef(oid) like '%co_applicant%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.bond_application_participants drop constraint %I', constraint_name);
  end if;

  alter table public.bond_application_participants
    add constraint bond_application_participants_role_phase7_check check (
      role in ('primary_applicant', 'co_applicant', 'surety')
    );
end $$;

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.bond_application_participants'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%'
    and pg_get_constraintdef(oid) like '%ready_for_submission%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.bond_application_participants drop constraint %I', constraint_name);
  end if;

  alter table public.bond_application_participants
    add constraint bond_application_participants_status_phase7_check check (
      status in (
        'pending_invite',
        'invited',
        'accepted',
        'in_progress',
        'changes_requested',
        'corrections_submitted',
        'ready_for_submission',
        'awaiting_signature',
        'signed',
        'completed',
        'declined',
        'withdrawn',
        'removed'
      )
    );
end $$;

alter table public.bond_applications
  alter column schema_version set default 'phase-7-v1',
  alter column flow_version set default 'phase-7-v1';

alter table public.bond_application_sections
  alter column schema_version set default 'phase-7-v1';

alter table public.bond_applications
  add column if not exists active_change_request_id uuid,
  add column if not exists revision_base_submission_id uuid,
  add column if not exists revision_status text not null default 'none' check (
    revision_status in (
      'none',
      'changes_requested',
      'revision_in_progress',
      'awaiting_internal_review',
      'ready_for_re_review',
      'awaiting_revised_signatures',
      'revision_submitted',
      'revision_cancelled'
    )
  ),
  add column if not exists revision_opened_at timestamptz,
  add column if not exists revision_opened_by uuid,
  add column if not exists revision_target_number integer,
  add column if not exists revision_locked_at timestamptz,
  add column if not exists revision_cancelled_at timestamptz;

create index if not exists bond_application_participants_surety_idx
  on public.bond_application_participants (bond_application_id, ordinal)
  where role = 'surety' and removed_at is null;

create table if not exists public.bond_application_change_requests (
  id uuid primary key default gen_random_uuid(),
  bond_application_id uuid not null references public.bond_applications(id) on delete cascade,
  base_submission_id uuid references public.transaction_bond_application_submissions(id) on delete set null,
  request_type text not null check (
    request_type in ('supplemental_documents', 'application_correction', 'participant_change', 'mixed')
  ),
  status text not null default 'draft' check (
    status in ('draft', 'sent', 'in_progress', 'awaiting_internal_review', 'resolved', 'withdrawn', 'superseded', 'cancelled')
  ),
  requires_new_submission boolean not null default false,
  target_application_revision integer,
  requested_by uuid,
  requested_by_role text,
  assigned_internal_user_id uuid,
  buyer_visible_summary text,
  internal_summary text,
  due_at timestamptz,
  sent_at timestamptz,
  first_viewed_at timestamptz,
  submitted_for_review_at timestamptz,
  resolved_at timestamptz,
  withdrawn_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.bond_application_change_request_items (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.bond_application_change_requests(id) on delete cascade,
  participant_id uuid references public.bond_application_participants(id) on delete restrict,
  target_scope text not null check (
    target_scope in (
      'shared_application',
      'primary_applicant',
      'co_applicant',
      'surety',
      'application_documents',
      'participant_documents'
    )
  ),
  target_type text not null check (
    target_type in (
      'section',
      'field',
      'repeatable_record',
      'document_requirement',
      'participant_structure',
      'declaration',
      'general'
    )
  ),
  section_key text,
  question_key text,
  field_path text,
  document_requirement_id uuid references public.bond_application_document_requirements(id) on delete set null,
  declaration_key text,
  title text not null,
  buyer_instruction text,
  internal_note text,
  status text not null default 'open' check (
    status in ('open', 'in_progress', 'addressed', 'awaiting_review', 'accepted', 'needs_more_information', 'withdrawn', 'superseded')
  ),
  blocking boolean not null default true,
  requires_new_submission boolean not null default false,
  display_order integer not null default 1,
  addressed_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (display_order > 0)
);

create unique index if not exists bond_application_change_request_items_unique_target_idx
  on public.bond_application_change_request_items (
    change_request_id,
    coalesce(participant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    target_scope,
    target_type,
    coalesce(section_key, ''),
    coalesce(question_key, ''),
    coalesce(field_path, ''),
    coalesce(document_requirement_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(declaration_key, '')
  )
  where status not in ('withdrawn', 'superseded');

create index if not exists bond_application_change_requests_application_status_idx
  on public.bond_application_change_requests (bond_application_id, status, created_at desc);

create index if not exists bond_application_change_requests_base_submission_idx
  on public.bond_application_change_requests (base_submission_id)
  where base_submission_id is not null;

create index if not exists bond_application_change_request_items_participant_status_idx
  on public.bond_application_change_request_items (participant_id, status)
  where participant_id is not null;

alter table public.bond_application_change_requests enable row level security;
alter table public.bond_application_change_request_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bond_application_change_requests'
      and policyname = 'bond_application_change_requests_read'
  ) then
    create policy bond_application_change_requests_read
      on public.bond_application_change_requests
      for select
      using (
        auth.role() = 'service_role'
        or exists (
          select 1
          from public.bond_applications ba
          where ba.id = bond_application_change_requests.bond_application_id
            and (
              public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
              or public.bridge_has_bond_application_participant_token_access(ba.id)
            )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bond_application_change_requests'
      and policyname = 'bond_application_change_requests_service_write'
  ) then
    create policy bond_application_change_requests_service_write
      on public.bond_application_change_requests
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bond_application_change_request_items'
      and policyname = 'bond_application_change_request_items_read'
  ) then
    create policy bond_application_change_request_items_read
      on public.bond_application_change_request_items
      for select
      using (
        auth.role() = 'service_role'
        or exists (
          select 1
          from public.bond_application_change_requests cr
          join public.bond_applications ba on ba.id = cr.bond_application_id
          where cr.id = bond_application_change_request_items.change_request_id
            and (
              (
                bond_application_change_request_items.participant_id is null
                and public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
              )
              or public.bridge_has_bond_application_participant_token_access(ba.id, bond_application_change_request_items.participant_id)
            )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bond_application_change_request_items'
      and policyname = 'bond_application_change_request_items_service_write'
  ) then
    create policy bond_application_change_request_items_service_write
      on public.bond_application_change_request_items
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

alter table public.transaction_bond_application_submissions
  add column if not exists supersedes_submission_id uuid references public.transaction_bond_application_submissions(id) on delete set null,
  add column if not exists superseded_by_submission_id uuid references public.transaction_bond_application_submissions(id) on delete set null,
  add column if not exists superseded_at timestamptz,
  add column if not exists supersession_reason text,
  add column if not exists revision_change_request_id uuid references public.bond_application_change_requests(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bond_applications_active_change_request_fk'
      and conrelid = 'public.bond_applications'::regclass
  ) then
    alter table public.bond_applications
      add constraint bond_applications_active_change_request_fk
      foreign key (active_change_request_id)
      references public.bond_application_change_requests(id)
      on delete set null
      not valid;

    alter table public.bond_applications validate constraint bond_applications_active_change_request_fk;
  end if;
end $$;

create index if not exists transaction_bond_application_submissions_lineage_idx
  on public.transaction_bond_application_submissions (supersedes_submission_id, superseded_by_submission_id);

create table if not exists public.transaction_bond_application_submission_documents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.transaction_bond_application_submissions(id) on delete cascade,
  document_role text not null,
  template_version text,
  generated_document_id uuid references public.documents(id) on delete set null,
  signed_document_id uuid references public.documents(id) on delete set null,
  required_signer_participant_ids uuid[] not null default '{}'::uuid[],
  signing_request_reference text,
  status text not null default 'generated' check (
    status in ('generated', 'awaiting_signature', 'partially_signed', 'signed', 'cancelled', 'superseded')
  ),
  generated_at timestamptz not null default now(),
  signed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists transaction_bond_application_submission_documents_role_idx
  on public.transaction_bond_application_submission_documents (submission_id, document_role);

alter table public.transaction_bond_application_submission_documents enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_application_submission_documents'
      and policyname = 'bond_submission_documents_read'
  ) then
    create policy bond_submission_documents_read
      on public.transaction_bond_application_submission_documents
      for select
      using (
        auth.role() = 'service_role'
        or exists (
          select 1
          from public.transaction_bond_application_submissions submission
          join public.bond_applications ba on ba.id = submission.bond_application_id
          where submission.id = transaction_bond_application_submission_documents.submission_id
            and (
              public.bridge_has_client_portal_token_transaction_access(ba.transaction_id)
              or public.bridge_has_bond_application_participant_token_access(ba.id)
            )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_application_submission_documents'
      and policyname = 'bond_submission_documents_service_write'
  ) then
    create policy bond_submission_documents_service_write
      on public.transaction_bond_application_submission_documents
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

create or replace function public.bridge_prevent_bond_submission_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.snapshot_json is distinct from new.snapshot_json
      or old.snapshot_hash is distinct from new.snapshot_hash
      or old.declarations_json is distinct from new.declarations_json
      or old.document_manifest_json is distinct from new.document_manifest_json
      or old.selected_bank_ids is distinct from new.selected_bank_ids
      or old.signer_manifest_json is distinct from new.signer_manifest_json
      or old.submission_version is distinct from new.submission_version
      or old.application_schema_version is distinct from new.application_schema_version
      or old.flow_version is distinct from new.flow_version
      or old.document_rule_set_version is distinct from new.document_rule_set_version
      or old.declaration_contract_version is distinct from new.declaration_contract_version
      or old.source_application_hash is distinct from new.source_application_hash
      or old.source_application_updated_at is distinct from new.source_application_updated_at
      or old.bond_application_id is distinct from new.bond_application_id
      or old.source_application_revision is distinct from new.source_application_revision
      or old.review_context_hash is distinct from new.review_context_hash
      or old.supersedes_submission_id is distinct from new.supersedes_submission_id
      or old.revision_change_request_id is distinct from new.revision_change_request_id
    then
      raise exception 'Bond application submission snapshot fields are immutable';
    end if;
  end if;
  return new;
end;
$$;

comment on column public.bond_applications.revision_status is
  'Phase 7 controlled revision lifecycle status for normalized guided buyer applications. This is not a finance workflow status.';
comment on table public.bond_application_change_requests is
  'Structured Phase 7 originator change requests. Buyer-visible wording and internal notes are stored separately.';
comment on table public.bond_application_change_request_items is
  'Stable section, field, participant or document targets for structured buyer correction requests.';
comment on table public.transaction_bond_application_submission_documents is
  'Phase 7 signing package document manifest for multi-document application and surety signing assignments.';
