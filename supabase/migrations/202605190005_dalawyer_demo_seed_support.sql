begin;

create extension if not exists "pgcrypto";

alter table if exists public.attorney_firms
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.attorney_firm_departments
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.buyers
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists phone text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.transactions
  add column if not exists is_demo_data boolean not null default false,
  add column if not exists transaction_reference text,
  add column if not exists title text,
  add column if not exists property_description text,
  add column if not exists property_address_line_1 text,
  add column if not exists property_address_line_2 text,
  add column if not exists suburb text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists seller_name text,
  add column if not exists seller_email text,
  add column if not exists seller_phone text,
  add column if not exists finance_type text,
  add column if not exists purchase_price numeric,
  add column if not exists sales_price numeric,
  add column if not exists bond_amount numeric,
  add column if not exists deposit_amount numeric,
  add column if not exists seller_has_existing_bond boolean not null default false,
  add column if not exists current_bond_bank text,
  add column if not exists current_bond_account_number text,
  add column if not exists estimated_settlement_amount numeric,
  add column if not exists stage text,
  add column if not exists current_main_stage text,
  add column if not exists current_sub_stage_summary text,
  add column if not exists attorney_stage text,
  add column if not exists risk_status text,
  add column if not exists operational_state text,
  add column if not exists next_action text,
  add column if not exists expected_transfer_date date,
  add column if not exists target_registration_date date,
  add column if not exists registration_date date,
  add column if not exists registered_at timestamptz,
  add column if not exists lifecycle_state text,
  add column if not exists is_active boolean not null default true,
  add column if not exists last_meaningful_activity_at timestamptz,
  add column if not exists assigned_attorney_email text,
  add column if not exists attorney text;

alter table if exists public.transaction_attorney_assignments
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.transaction_subprocesses
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.transaction_subprocess_steps
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists due_date date,
  add column if not exists completed_at timestamptz,
  add column if not exists blocker_reason text,
  add column if not exists notes text,
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.transaction_subprocess_steps drop constraint if exists transaction_subprocess_steps_status_check;
alter table if exists public.transaction_subprocess_steps
  add constraint transaction_subprocess_steps_status_check
  check (status in ('not_started', 'in_progress', 'completed', 'blocked', 'waiting'));

alter table if exists public.documents
  add column if not exists is_demo_data boolean not null default false,
  add column if not exists file_path text,
  add column if not exists document_type text,
  add column if not exists visibility_scope text not null default 'internal',
  add column if not exists uploaded_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists uploaded_by_role text,
  add column if not exists stage_key text,
  add column if not exists is_client_visible boolean not null default false,
  add column if not exists review_status text,
  add column if not exists lane_key text,
  add column if not exists attorney_role text;

alter table if exists public.document_requests
  add column if not exists is_demo_data boolean not null default false,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists document_type text,
  add column if not exists priority text,
  add column if not exists assigned_to_role text,
  add column if not exists requires_review boolean not null default true,
  add column if not exists visibility_scope text not null default 'internal',
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_by_role text,
  add column if not exists due_date date,
  add column if not exists lane_key text,
  add column if not exists attorney_role text,
  add column if not exists requested_from text,
  add column if not exists requested_by uuid references auth.users(id) on delete set null,
  add column if not exists review_status text not null default 'requested',
  add column if not exists requirement_id text,
  add column if not exists rejection_reason text;

alter table if exists public.transaction_events
  add column if not exists is_demo_data boolean not null default false,
  add column if not exists event_data jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_by_role text,
  add column if not exists visibility_scope text not null default 'internal';

alter table if exists public.transaction_participants
  add column if not exists transaction_id uuid references public.transactions(id) on delete cascade,
  add column if not exists user_id uuid references public.profiles(id) on delete set null,
  add column if not exists role_type text,
  add column if not exists legal_role text not null default 'none',
  add column if not exists status text not null default 'active',
  add column if not exists participant_name text,
  add column if not exists participant_email text,
  add column if not exists visibility_scope text not null default 'shared',
  add column if not exists can_view boolean not null default true,
  add column if not exists can_comment boolean not null default true,
  add column if not exists can_upload_documents boolean not null default true,
  add column if not exists can_edit_finance_workflow boolean not null default false,
  add column if not exists can_edit_attorney_workflow boolean not null default false,
  add column if not exists can_edit_core_transaction boolean not null default false,
  add column if not exists participant_scope text not null default 'transaction',
  add column if not exists is_primary boolean not null default false,
  add column if not exists assignment_source text not null default 'transaction_direct',
  add column if not exists organisation_name text,
  add column if not exists accepted_at timestamptz,
  add column if not exists removed_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.transaction_participants
  drop constraint if exists transaction_participants_assignment_source_check;

alter table if exists public.transaction_participants
  add constraint transaction_participants_assignment_source_check
  check (assignment_source = any (array[
    'transaction_direct',
    'development_default',
    'system_inherited',
    'reference_only',
    'attorney_assignment',
    'dalawyer_demo_seed'
  ]));

alter table if exists public.transaction_attorney_lane_history
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.transaction_attorney_lane_updates
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.attorney_workflow_blockers
  add column if not exists is_demo_data boolean not null default false;

create index if not exists attorney_firms_organisation_idx
  on public.attorney_firms (organisation_id)
  where organisation_id is not null;

create index if not exists transactions_dalawyer_demo_idx
  on public.transactions (organisation_id, created_at desc)
  where is_demo_data = true;

create index if not exists buyers_dalawyer_demo_idx
  on public.buyers (organisation_id, created_at desc)
  where is_demo_data = true;

create index if not exists transaction_attorney_assignments_demo_idx
  on public.transaction_attorney_assignments (firm_id, transaction_id)
  where is_demo_data = true;

create index if not exists transaction_subprocesses_demo_idx
  on public.transaction_subprocesses (transaction_id, process_type)
  where is_demo_data = true;

create index if not exists transaction_subprocess_steps_demo_idx
  on public.transaction_subprocess_steps (subprocess_id, sort_order)
  where is_demo_data = true;

create index if not exists documents_demo_idx
  on public.documents (transaction_id, category)
  where is_demo_data = true;

create index if not exists document_requests_demo_idx
  on public.document_requests (transaction_id, status)
  where is_demo_data = true;

create index if not exists transaction_events_demo_idx
  on public.transaction_events (transaction_id, created_at desc)
  where is_demo_data = true;

create index if not exists transaction_participants_demo_idx
  on public.transaction_participants (transaction_id, role_type, legal_role)
  where is_demo_data = true;

commit;
