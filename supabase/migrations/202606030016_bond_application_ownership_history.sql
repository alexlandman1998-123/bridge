create table if not exists public.bond_application_ownership_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  bond_application_id uuid references public.transaction_bond_applications(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete cascade,
  application_reference text,
  event_type text not null,
  from_consultant_id uuid references auth.users(id) on delete set null,
  to_consultant_id uuid references auth.users(id) on delete set null,
  consultant_id uuid references auth.users(id) on delete set null,
  branch_id uuid,
  region_id uuid,
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now(),
  constraint bond_application_ownership_history_event_type_check
    check (event_type in ('APPLICATION_ASSIGNED', 'APPLICATION_REASSIGNED', 'APPLICATION_ESCALATED', 'APPLICATION_TRANSFERRED'))
);

create index if not exists bond_application_ownership_history_org_idx
  on public.bond_application_ownership_history (organisation_id, created_at desc);

create index if not exists bond_application_ownership_history_application_idx
  on public.bond_application_ownership_history (bond_application_id, created_at desc);

create index if not exists bond_application_ownership_history_transaction_idx
  on public.bond_application_ownership_history (transaction_id, created_at desc);

create index if not exists bond_application_ownership_history_consultant_idx
  on public.bond_application_ownership_history (organisation_id, consultant_id, created_at desc);

create index if not exists bond_application_ownership_history_scope_idx
  on public.bond_application_ownership_history (organisation_id, region_id, branch_id, created_at desc);

alter table public.bond_application_ownership_history enable row level security;

drop policy if exists bond_application_ownership_history_select_member on public.bond_application_ownership_history;
create policy bond_application_ownership_history_select_member
  on public.bond_application_ownership_history
  for select
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists bond_application_ownership_history_insert_member on public.bond_application_ownership_history;
create policy bond_application_ownership_history_insert_member
  on public.bond_application_ownership_history
  for insert
  with check (public.bridge_is_active_member(organisation_id));
