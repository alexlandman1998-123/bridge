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

-- A bond originator is deliberately allowed to update the application that
-- they own. Recording the corresponding bank decision must use the exact
-- same scoped access boundary; otherwise the application update succeeds and
-- the required audit row fails afterwards with an RLS error.
create or replace function public.bridge_can_access_bond_bank_outcome(
  p_transaction_id uuid,
  p_workflow_id uuid,
  p_bond_application_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null
    and exists (
      select 1
      from public.transaction_bond_applications application
      join public.transaction_finance_workflows workflow
        on workflow.id = application.workflow_id
      where application.id = p_bond_application_id
        and application.transaction_id = p_transaction_id
        and application.workflow_id = p_workflow_id
        and workflow.transaction_id = p_transaction_id
        and workflow.workflow_type = 'bond_hybrid'
        and (
          public.bridge_transaction_scope_is_internal_user()
          or public.bridge_can_access_bond_application_scope(application.id)
          or exists (
            select 1
            from public.transaction_participants participant
            where participant.transaction_id = p_transaction_id
              and coalesce(participant.status, 'active') = 'active'
              and participant.removed_at is null
              and participant.can_edit_finance_workflow = true
              and (
                participant.user_id = auth.uid()
                or participant.assigned_user_id = auth.uid()
                or lower(coalesce(participant.participant_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
              )
          )
        )
    ),
    false
  )
$$;

grant execute on function public.bridge_can_access_bond_bank_outcome(uuid, uuid, uuid) to authenticated;

drop policy if exists transaction_bond_bank_outcomes_select on public.transaction_bond_bank_outcomes;
create policy transaction_bond_bank_outcomes_select
  on public.transaction_bond_bank_outcomes
  for select
  to authenticated
  using (
    public.bridge_can_access_bond_bank_outcome(
      transaction_id,
      workflow_id,
      bond_application_id
    )
  );

drop policy if exists transaction_bond_bank_outcomes_insert on public.transaction_bond_bank_outcomes;
create policy transaction_bond_bank_outcomes_insert
  on public.transaction_bond_bank_outcomes
  for insert
  to authenticated
  with check (
    recorded_by = auth.uid()
    and bank_name = (
      select application.bank_name
      from public.transaction_bond_applications application
      where application.id = transaction_bond_bank_outcomes.bond_application_id
    )
    and public.bridge_can_access_bond_bank_outcome(
      transaction_id,
      workflow_id,
      bond_application_id
    )
  );

notify pgrst, 'reload schema';

commit;
