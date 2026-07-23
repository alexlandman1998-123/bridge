begin;

-- Keep the original 202607220015 schema migration immutable. This forward-only
-- repair gives a normal bond originator the same scoped outcome access as the
-- bond application they are already authorised to update.
alter table public.transaction_bond_bank_outcomes enable row level security;

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

revoke all on function public.bridge_can_access_bond_bank_outcome(uuid, uuid, uuid) from public;
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
