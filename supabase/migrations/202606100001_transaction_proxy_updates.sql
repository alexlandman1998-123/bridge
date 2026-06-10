begin;

create extension if not exists "pgcrypto";

create table if not exists public.transaction_proxy_updates (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  target_role_type text not null,
  target_participant_id uuid references public.transaction_participants(id) on delete set null,
  workflow_area text not null default 'general',
  workflow_step_id text,
  previous_status text,
  new_status text,
  note text not null,
  evidence_document_id uuid,
  created_by_user_id uuid,
  created_by_role text,
  confirmation_status text not null default 'pending',
  confirmed_by_user_id uuid,
  confirmed_at timestamptz,
  rejection_reason text,
  metadata jsonb not null default '{}'::jsonb,
  is_demo_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.transaction_proxy_updates
  add column if not exists target_participant_id uuid references public.transaction_participants(id) on delete set null;
alter table if exists public.transaction_proxy_updates
  add column if not exists workflow_step_id text;
alter table if exists public.transaction_proxy_updates
  add column if not exists previous_status text;
alter table if exists public.transaction_proxy_updates
  add column if not exists evidence_document_id uuid;
alter table if exists public.transaction_proxy_updates
  add column if not exists created_by_user_id uuid;
alter table if exists public.transaction_proxy_updates
  add column if not exists created_by_role text;
alter table if exists public.transaction_proxy_updates
  add column if not exists confirmed_by_user_id uuid;
alter table if exists public.transaction_proxy_updates
  add column if not exists confirmed_at timestamptz;
alter table if exists public.transaction_proxy_updates
  add column if not exists rejection_reason text;
alter table if exists public.transaction_proxy_updates
  add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table if exists public.transaction_proxy_updates
  add column if not exists is_demo_data boolean not null default false;
alter table if exists public.transaction_proxy_updates
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.transaction_proxy_updates
  drop constraint if exists transaction_proxy_updates_confirmation_status_check;
alter table if exists public.transaction_proxy_updates
  add constraint transaction_proxy_updates_confirmation_status_check
  check (confirmation_status in ('pending', 'confirmed', 'rejected', 'superseded'));

alter table if exists public.transaction_proxy_updates
  drop constraint if exists transaction_proxy_updates_workflow_area_check;
alter table if exists public.transaction_proxy_updates
  add constraint transaction_proxy_updates_workflow_area_check
  check (workflow_area in ('general', 'sales', 'finance', 'transfer', 'bond', 'cancellation', 'documents', 'onboarding', 'client'));

create index if not exists transaction_proxy_updates_transaction_created_idx
  on public.transaction_proxy_updates (transaction_id, created_at desc);

create index if not exists transaction_proxy_updates_confirmation_idx
  on public.transaction_proxy_updates (transaction_id, confirmation_status, created_at desc);

create index if not exists transaction_proxy_updates_role_idx
  on public.transaction_proxy_updates (transaction_id, target_role_type, workflow_area);

create index if not exists transaction_proxy_updates_demo_idx
  on public.transaction_proxy_updates (transaction_id, created_at desc)
  where is_demo_data = true;

create or replace function public.bridge_touch_transaction_proxy_update_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists transaction_proxy_updates_touch_updated_at on public.transaction_proxy_updates;
create trigger transaction_proxy_updates_touch_updated_at
before update on public.transaction_proxy_updates
for each row
execute function public.bridge_touch_transaction_proxy_update_updated_at();

alter table if exists public.transaction_proxy_updates enable row level security;

drop policy if exists transaction_proxy_updates_select_transaction_scope on public.transaction_proxy_updates;
create policy transaction_proxy_updates_select_transaction_scope
  on public.transaction_proxy_updates
  for select
  to authenticated
  using (
    public.bridge_has_transaction_permission(transaction_id, 'view_transaction')
    or public.bridge_has_transaction_permission(transaction_id, 'comment')
  );

drop policy if exists transaction_proxy_updates_insert_transaction_coordinator on public.transaction_proxy_updates;
create policy transaction_proxy_updates_insert_transaction_coordinator
  on public.transaction_proxy_updates
  for insert
  to authenticated
  with check (
    public.bridge_has_transaction_permission(transaction_id, 'edit_core_transaction')
  );

drop policy if exists transaction_proxy_updates_update_target_role_or_coordinator on public.transaction_proxy_updates;
create policy transaction_proxy_updates_update_target_role_or_coordinator
  on public.transaction_proxy_updates
  for update
  to authenticated
  using (
    public.bridge_has_transaction_permission(transaction_id, 'edit_core_transaction')
    or public.bridge_current_transaction_role(transaction_id) = target_role_type
  )
  with check (
    public.bridge_has_transaction_permission(transaction_id, 'edit_core_transaction')
    or public.bridge_current_transaction_role(transaction_id) = target_role_type
  );

commit;
