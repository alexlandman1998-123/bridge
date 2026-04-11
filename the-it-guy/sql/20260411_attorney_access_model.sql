begin;

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
create index if not exists development_participants_email_idx
  on development_participants (participant_email);
create index if not exists development_participants_development_role_idx
  on development_participants (development_id, role_type);

alter table if exists transaction_participants add column if not exists user_id uuid references profiles(id) on delete set null;
alter table if exists transaction_participants add column if not exists participant_scope text not null default 'transaction';
alter table if exists transaction_participants add column if not exists assignment_source text not null default 'transaction_direct';
alter table if exists transaction_participants add column if not exists is_primary boolean not null default false;
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
create index if not exists transaction_participants_user_id_idx
  on transaction_participants (user_id);

commit;
