begin;

create table if not exists public.transaction_bond_bank_outcomes (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  workflow_id uuid not null references public.transaction_finance_workflows(id) on delete cascade,
  bond_application_id uuid not null references public.transaction_bond_applications(id) on delete cascade,
  bank_name text not null,
  outcome text not null,
  outcome_at timestamptz not null default now(),
  approved_amount numeric(14, 2),
  conditions text,
  decline_reason text,
  notes text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint transaction_bond_bank_outcomes_outcome_check
    check (outcome in ('approved', 'declined', 'conditional', 'additional_documents_required', 'withdrawn', 'expired'))
);

create index if not exists transaction_bond_bank_outcomes_workflow_idx
  on public.transaction_bond_bank_outcomes (workflow_id, outcome_at desc);

create index if not exists transaction_bond_bank_outcomes_application_idx
  on public.transaction_bond_bank_outcomes (bond_application_id, outcome_at desc);

alter table public.transaction_bond_bank_outcomes enable row level security;

drop policy if exists transaction_bond_bank_outcomes_select on public.transaction_bond_bank_outcomes;
create policy transaction_bond_bank_outcomes_select
  on public.transaction_bond_bank_outcomes
  for select
  to authenticated
  using (public.bridge_transaction_scope_is_internal_user());

drop policy if exists transaction_bond_bank_outcomes_insert on public.transaction_bond_bank_outcomes;
create policy transaction_bond_bank_outcomes_insert
  on public.transaction_bond_bank_outcomes
  for insert
  to authenticated
  with check (public.bridge_transaction_scope_is_internal_user());

commit;
