begin;

-- Bridge Migration Pack 1
-- Additive, non-breaking schema hardening only.
-- Apply to staging first.

create or replace function set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Development participants
-- ---------------------------------------------------------------------------

create table if not exists development_participants (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references developments(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  role_type text not null,
  participant_name text,
  participant_email text,
  organisation_name text,
  is_primary boolean not null default false,
  can_view boolean not null default true,
  can_create_transactions boolean not null default false,
  assignment_source text not null default 'development_default',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table development_participants drop constraint if exists development_participants_role_type_check;
alter table development_participants
  add constraint development_participants_role_type_check
  check (
    role_type in (
      'developer',
      'agent',
      'attorney',
      'bond_originator',
      'transfer_conveyancer',
      'buyer_attorney',
      'seller_attorney',
      'internal_admin'
    )
  );

create index if not exists development_participants_development_id_idx
  on development_participants (development_id);
create index if not exists development_participants_user_id_idx
  on development_participants (user_id);
create index if not exists development_participants_development_role_idx
  on development_participants (development_id, role_type);
create index if not exists development_participants_development_primary_idx
  on development_participants (development_id, is_primary);

drop trigger if exists trg_development_participants_updated_at on development_participants;
create trigger trg_development_participants_updated_at
before update on development_participants
for each row
execute function set_updated_at_timestamp();

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------

alter table if exists transactions add column if not exists transaction_origin_role text;
alter table if exists transactions add column if not exists transaction_origin_source text;
alter table if exists transactions add column if not exists buyer_attorney_name text;
alter table if exists transactions add column if not exists buyer_attorney_email text;
alter table if exists transactions add column if not exists seller_attorney_name text;
alter table if exists transactions add column if not exists seller_attorney_email text;
alter table if exists transactions add column if not exists primary_transfer_conveyancer_name text;
alter table if exists transactions add column if not exists primary_transfer_conveyancer_email text;
alter table if exists transactions add column if not exists main_stage_key text;
alter table if exists transactions add column if not exists completed_at timestamptz;
alter table if exists transactions add column if not exists archived_at timestamptz;
alter table if exists transactions add column if not exists archived_by uuid references profiles(id) on delete set null;

alter table transactions drop constraint if exists transactions_transaction_origin_role_check;
alter table transactions
  add constraint transactions_transaction_origin_role_check
  check (
    transaction_origin_role is null
    or transaction_origin_role in ('developer', 'agent', 'attorney', 'internal_admin')
  );

alter table transactions drop constraint if exists transactions_transaction_origin_source_check;
alter table transactions
  add constraint transactions_transaction_origin_source_check
  check (
    transaction_origin_source is null
    or transaction_origin_source in ('developer', 'agent', 'attorney')
  );

alter table transactions drop constraint if exists transactions_main_stage_key_check;
alter table transactions
  add constraint transactions_main_stage_key_check
  check (
    main_stage_key is null
    or main_stage_key in ('AVAIL', 'BUYER_SECURED', 'AGREEMENT_SIGNED', 'FINANCE_SECURED', 'TRANSFER_PREP', 'LODGE_TRANSFER', 'REGISTERED')
  );

create index if not exists transactions_main_stage_key_idx
  on transactions (main_stage_key);
create index if not exists transactions_transaction_origin_source_idx
  on transactions (transaction_origin_source);
create index if not exists transactions_archived_at_idx
  on transactions (archived_at);
create index if not exists transactions_completed_at_idx
  on transactions (completed_at);

-- ---------------------------------------------------------------------------
-- Transaction participants
-- ---------------------------------------------------------------------------

alter table if exists transaction_participants add column if not exists participant_scope text not null default 'transaction';
alter table if exists transaction_participants add column if not exists is_primary boolean not null default false;
alter table if exists transaction_participants add column if not exists assignment_source text not null default 'transaction_direct';
alter table if exists transaction_participants add column if not exists organisation_name text;
alter table if exists transaction_participants add column if not exists can_manage_handover boolean not null default false;
alter table if exists transaction_participants add column if not exists can_manage_snags boolean not null default false;
alter table if exists transaction_participants add column if not exists can_approve_documents boolean not null default false;
alter table if exists transaction_participants add column if not exists can_view_financials boolean not null default false;
alter table if exists transaction_participants add column if not exists can_assign_roles boolean not null default false;

alter table transaction_participants drop constraint if exists transaction_participants_participant_scope_check;
alter table transaction_participants
  add constraint transaction_participants_participant_scope_check
  check (participant_scope in ('transaction', 'development', 'reference'));

alter table transaction_participants drop constraint if exists transaction_participants_assignment_source_check;
alter table transaction_participants
  add constraint transaction_participants_assignment_source_check
  check (assignment_source in ('transaction_direct', 'development_default', 'system_inherited', 'reference_only'));

create index if not exists transaction_participants_transaction_role_primary_idx
  on transaction_participants (transaction_id, role_type, is_primary);
create index if not exists transaction_participants_participant_scope_idx
  on transaction_participants (participant_scope);

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------

alter table if exists documents add column if not exists bucket_key text;
alter table if exists documents add column if not exists template_key text references document_templates(key) on update cascade on delete set null;
alter table if exists documents add column if not exists status text not null default 'uploaded';
alter table if exists documents add column if not exists visibility_scope text not null default 'internal';
alter table if exists documents add column if not exists owner_role text;
alter table if exists documents add column if not exists uploaded_by_user_id uuid references profiles(id) on delete set null;
alter table if exists documents add column if not exists approved_by_user_id uuid references profiles(id) on delete set null;
alter table if exists documents add column if not exists approved_at timestamptz;
alter table if exists documents add column if not exists rejected_at timestamptz;
alter table if exists documents add column if not exists rejection_note text;
alter table if exists documents add column if not exists version_group_id uuid;
alter table if exists documents add column if not exists version_number integer not null default 1;
alter table if exists documents add column if not exists supersedes_document_id uuid references documents(id) on delete set null;
alter table if exists documents add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table if exists documents add column if not exists updated_at timestamptz not null default now();

alter table documents drop constraint if exists documents_status_check;
alter table documents
  add constraint documents_status_check
  check (
    status in ('requested', 'uploaded', 'pending_review', 'approved', 'rejected', 'needs_replacement')
  );

alter table documents drop constraint if exists documents_visibility_scope_check;
alter table documents
  add constraint documents_visibility_scope_check
  check (visibility_scope in ('internal', 'shared'));

alter table documents drop constraint if exists documents_version_number_check;
alter table documents
  add constraint documents_version_number_check
  check (version_number >= 1);

create index if not exists documents_transaction_bucket_idx
  on documents (transaction_id, bucket_key);
create index if not exists documents_transaction_visibility_idx
  on documents (transaction_id, visibility_scope);
create index if not exists documents_transaction_status_idx
  on documents (transaction_id, status);
create index if not exists documents_template_key_idx
  on documents (template_key);
create index if not exists documents_version_group_idx
  on documents (version_group_id, version_number desc);

drop trigger if exists trg_documents_updated_at on documents;
create trigger trg_documents_updated_at
before update on documents
for each row
execute function set_updated_at_timestamp();

-- ---------------------------------------------------------------------------
-- Transaction required documents
-- ---------------------------------------------------------------------------

alter table if exists transaction_required_documents add column if not exists requested_at timestamptz;
alter table if exists transaction_required_documents add column if not exists submitted_at timestamptz;
alter table if exists transaction_required_documents add column if not exists reviewed_at timestamptz;
alter table if exists transaction_required_documents add column if not exists approved_at timestamptz;
alter table if exists transaction_required_documents add column if not exists rejected_note text;
alter table if exists transaction_required_documents add column if not exists requested_by_user_id uuid references profiles(id) on delete set null;
alter table if exists transaction_required_documents add column if not exists linked_bucket_key text;
alter table if exists transaction_required_documents add column if not exists request_source_role text;

create index if not exists transaction_required_documents_transaction_status_requested_idx
  on transaction_required_documents (transaction_id, status, requested_at desc);
create index if not exists transaction_required_documents_transaction_bucket_idx
  on transaction_required_documents (transaction_id, linked_bucket_key);
create index if not exists transaction_required_documents_requested_by_user_idx
  on transaction_required_documents (requested_by_user_id);

-- ---------------------------------------------------------------------------
-- Transaction subprocesses
-- ---------------------------------------------------------------------------

alter table if exists transaction_subprocesses add column if not exists finance_type_context text;
alter table if exists transaction_subprocesses add column if not exists is_required boolean not null default true;
alter table if exists transaction_subprocesses add column if not exists started_at timestamptz;
alter table if exists transaction_subprocesses add column if not exists completed_at timestamptz;
alter table if exists transaction_subprocesses add column if not exists blocked_reason text;
alter table if exists transaction_subprocesses add column if not exists visibility_scope text not null default 'internal';

create index if not exists transaction_subprocesses_transaction_visibility_idx
  on transaction_subprocesses (transaction_id, visibility_scope);
create index if not exists transaction_subprocesses_transaction_status_idx
  on transaction_subprocesses (transaction_id, status);

-- ---------------------------------------------------------------------------
-- Transaction subprocess steps
-- ---------------------------------------------------------------------------

alter table if exists transaction_subprocess_steps add column if not exists status_flag_key text;
alter table if exists transaction_subprocess_steps add column if not exists is_blocking boolean not null default false;
alter table if exists transaction_subprocess_steps add column if not exists is_optional boolean not null default false;
alter table if exists transaction_subprocess_steps add column if not exists applies_to_finance_type text;
alter table if exists transaction_subprocess_steps add column if not exists started_at timestamptz;
alter table if exists transaction_subprocess_steps add column if not exists due_at timestamptz;
alter table if exists transaction_subprocess_steps add column if not exists completed_by uuid references profiles(id) on delete set null;
alter table if exists transaction_subprocess_steps add column if not exists visibility_scope text not null default 'internal';
alter table if exists transaction_subprocess_steps add column if not exists document_dependency_key text;
alter table if exists transaction_subprocess_steps add column if not exists stage_dependency_key text;
alter table if exists transaction_subprocess_steps add column if not exists step_metadata jsonb not null default '{}'::jsonb;

create index if not exists transaction_subprocess_steps_subprocess_status_flag_idx
  on transaction_subprocess_steps (subprocess_id, status_flag_key);
create index if not exists transaction_subprocess_steps_subprocess_visibility_idx
  on transaction_subprocess_steps (subprocess_id, visibility_scope);
create index if not exists transaction_subprocess_steps_completed_by_idx
  on transaction_subprocess_steps (completed_by);
create index if not exists transaction_subprocess_steps_due_at_idx
  on transaction_subprocess_steps (due_at);

-- ---------------------------------------------------------------------------
-- Transaction handover
-- ---------------------------------------------------------------------------

alter table if exists transaction_handover add column if not exists scheduled_by_user_id uuid references profiles(id) on delete set null;
alter table if exists transaction_handover add column if not exists attendance_confirmed_at timestamptz;
alter table if exists transaction_handover add column if not exists attendance_confirmed_by_name text;
alter table if exists transaction_handover add column if not exists signature_image_path text;
alter table if exists transaction_handover add column if not exists inspection_document_id uuid references documents(id) on delete set null;
alter table if exists transaction_handover add column if not exists electricity_meter_photo_document_id uuid references documents(id) on delete set null;
alter table if exists transaction_handover add column if not exists water_meter_photo_document_id uuid references documents(id) on delete set null;
alter table if exists transaction_handover add column if not exists gas_meter_photo_document_id uuid references documents(id) on delete set null;

create index if not exists transaction_handover_status_date_idx
  on transaction_handover (status, handover_date);
create index if not exists transaction_handover_scheduled_by_idx
  on transaction_handover (scheduled_by_user_id);

-- ---------------------------------------------------------------------------
-- Client issues / snags
-- ---------------------------------------------------------------------------

alter table if exists client_issues add column if not exists category_key text;
alter table if exists client_issues add column if not exists assigned_contractor_name text;
alter table if exists client_issues add column if not exists assigned_contractor_contact text;
alter table if exists client_issues add column if not exists resolution_notes text;
alter table if exists client_issues add column if not exists addressed_at timestamptz;
alter table if exists client_issues add column if not exists addressed_by_user_id uuid references profiles(id) on delete set null;
alter table if exists client_issues add column if not exists completed_at timestamptz;
alter table if exists client_issues add column if not exists completed_by_user_id uuid references profiles(id) on delete set null;
alter table if exists client_issues add column if not exists client_confirmed_at timestamptz;
alter table if exists client_issues add column if not exists client_rejected_at timestamptz;
alter table if exists client_issues add column if not exists client_feedback text;
alter table if exists client_issues add column if not exists due_date date;

create index if not exists client_issues_status_due_date_idx
  on client_issues (status, due_date);
create index if not exists client_issues_transaction_status_idx
  on client_issues (transaction_id, status);
create index if not exists client_issues_category_key_idx
  on client_issues (category_key);
create index if not exists client_issues_assigned_contractor_idx
  on client_issues (assigned_contractor_name);

-- ---------------------------------------------------------------------------
-- Transaction occupational rent
-- ---------------------------------------------------------------------------

create table if not exists transaction_occupational_rent (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references transactions(id) on delete cascade,
  is_enabled boolean not null default false,
  status text not null default 'not_applicable',
  occupation_date date,
  rent_start_date date,
  monthly_amount numeric(12,2),
  pro_rata_amount numeric(12,2),
  next_due_date date,
  waived boolean not null default false,
  waiver_reason text,
  notes text,
  created_by uuid references profiles(id) on delete set null,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table transaction_occupational_rent drop constraint if exists transaction_occupational_rent_status_check;
alter table transaction_occupational_rent
  add constraint transaction_occupational_rent_status_check
  check (
    status in ('not_applicable', 'pending_setup', 'active', 'overdue', 'settled', 'closed')
  );

create index if not exists transaction_occupational_rent_status_idx
  on transaction_occupational_rent (status);
create index if not exists transaction_occupational_rent_is_enabled_idx
  on transaction_occupational_rent (is_enabled);
create index if not exists transaction_occupational_rent_next_due_date_idx
  on transaction_occupational_rent (next_due_date);

drop trigger if exists trg_transaction_occupational_rent_updated_at on transaction_occupational_rent;
create trigger trg_transaction_occupational_rent_updated_at
before update on transaction_occupational_rent
for each row
execute function set_updated_at_timestamp();

commit;
