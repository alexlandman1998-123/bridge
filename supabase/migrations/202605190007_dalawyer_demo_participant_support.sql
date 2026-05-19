begin;

alter table if exists public.buyers
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists is_demo_data boolean not null default false;

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

create index if not exists transaction_participants_demo_idx
  on public.transaction_participants (transaction_id, role_type, legal_role)
  where is_demo_data = true;

commit;
