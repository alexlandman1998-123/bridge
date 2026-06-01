begin;

create or replace function public.bridge_can_override_bond_assignment_scope_phase5f(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and public.bridge_can_manage_bond_assignment_phase5d(transaction_id)
$$;

create or replace function public.bridge_can_submit_bond_to_banks_phase5g(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select public.bridge_can_submit_bond_to_banks_phase5f(transaction_id)
$$;

create or replace function public.bridge_can_revoke_bond_bank_submission_phase5g(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select public.bridge_can_submit_bond_to_banks_phase5g(transaction_id)
$$;

create or replace function public.bridge_can_resubmit_bond_to_banks_phase5g(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select public.bridge_can_submit_bond_to_banks_phase5g(transaction_id)
$$;

create or replace function public.bridge_can_assign_bond_workspace_phase5g(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select public.bridge_can_assign_bond_workspace_phase5f(transaction_id)
$$;

create or replace function public.bridge_can_assign_bond_region_phase5g(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select public.bridge_can_assign_bond_region_phase5f(transaction_id)
$$;

create or replace function public.bridge_can_assign_bond_unit_phase5g(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select public.bridge_can_assign_bond_unit_phase5f(transaction_id)
$$;

create or replace function public.bridge_can_assign_bond_consultant_phase5g(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select public.bridge_can_assign_bond_consultant_phase5f(transaction_id)
$$;

create or replace function public.bridge_can_assign_bond_processor_phase5g(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select public.bridge_can_assign_bond_processor_phase5f(transaction_id)
$$;

create or replace function public.bridge_can_assign_bond_manager_phase5g(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select public.bridge_can_assign_bond_manager_phase5f(transaction_id)
$$;

create or replace function public.bridge_can_assign_bond_compliance_phase5g(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select public.bridge_can_assign_bond_compliance_phase5f(transaction_id)
$$;

create or replace function public.bridge_can_clear_bond_assignment_phase5g(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select public.bridge_can_clear_bond_assignment_phase5f(transaction_id)
$$;

create or replace function public.bridge_can_transfer_bond_application_workspace_phase5g(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select public.bridge_can_transfer_bond_application_workspace_phase5f(transaction_id)
$$;

create or replace function public.bridge_can_override_bond_assignment_scope_phase5g(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select public.bridge_can_override_bond_assignment_scope_phase5f(transaction_id)
$$;

create or replace function public.bridge_can_mutate_bond_assignment_phase5g(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select (
    public.bridge_can_assign_bond_workspace_phase5g(transaction_id)
    or public.bridge_can_assign_bond_region_phase5g(transaction_id)
    or public.bridge_can_assign_bond_unit_phase5g(transaction_id)
    or public.bridge_can_assign_bond_consultant_phase5g(transaction_id)
    or public.bridge_can_assign_bond_processor_phase5g(transaction_id)
    or public.bridge_can_assign_bond_manager_phase5g(transaction_id)
    or public.bridge_can_assign_bond_compliance_phase5g(transaction_id)
    or public.bridge_can_clear_bond_assignment_phase5g(transaction_id)
    or public.bridge_can_transfer_bond_application_workspace_phase5g(transaction_id)
    or public.bridge_can_override_bond_assignment_scope_phase5g(transaction_id)
  )
$$;

create or replace function public.bridge_can_mutate_bond_sensitive_transaction_phase5g(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select (
    public.bridge_can_submit_bond_to_banks_phase5g(transaction_id)
    or public.bridge_can_revoke_bond_bank_submission_phase5g(transaction_id)
    or public.bridge_can_resubmit_bond_to_banks_phase5g(transaction_id)
    or public.bridge_can_mutate_bond_assignment_phase5g(transaction_id)
  )
$$;

create policy transactions_update_phase5g_bond_sensitive_mutation on public.transactions
for update to authenticated
using (
  public.bridge_can_mutate_bond_sensitive_transaction_phase5g(id)
)
with check (
  public.bridge_can_mutate_bond_sensitive_transaction_phase5g(id)
);

do $$
begin
  if to_regclass('public.transaction_role_players') is not null then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'transaction_role_players'
        and policyname = 'transaction_role_players_insert_phase5g_bond_sensitive_mutation'
    ) then
      execute $policy$
        create policy transaction_role_players_insert_phase5g_bond_sensitive_mutation on public.transaction_role_players
        for insert to authenticated
        with check (
          public.transaction_role_players.transaction_id is not null
          and public.bridge_can_mutate_bond_assignment_phase5g(public.transaction_role_players.transaction_id)
        )
      $policy$;
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'transaction_role_players'
        and policyname = 'transaction_role_players_update_phase5g_bond_sensitive_mutation'
    ) then
      execute $policy$
        create policy transaction_role_players_update_phase5g_bond_sensitive_mutation on public.transaction_role_players
        for update to authenticated
        using (
          public.transaction_role_players.transaction_id is not null
          and public.bridge_can_mutate_bond_assignment_phase5g(public.transaction_role_players.transaction_id)
        )
        with check (
          public.transaction_role_players.transaction_id is not null
          and public.bridge_can_mutate_bond_assignment_phase5g(public.transaction_role_players.transaction_id)
        )
      $policy$;
    end if;
  end if;
end $$;

grant execute on function public.bridge_can_submit_bond_to_banks_phase5g(uuid) to authenticated;
grant execute on function public.bridge_can_revoke_bond_bank_submission_phase5g(uuid) to authenticated;
grant execute on function public.bridge_can_resubmit_bond_to_banks_phase5g(uuid) to authenticated;
grant execute on function public.bridge_can_assign_bond_workspace_phase5g(uuid) to authenticated;
grant execute on function public.bridge_can_assign_bond_region_phase5g(uuid) to authenticated;
grant execute on function public.bridge_can_assign_bond_unit_phase5g(uuid) to authenticated;
grant execute on function public.bridge_can_assign_bond_consultant_phase5g(uuid) to authenticated;
grant execute on function public.bridge_can_assign_bond_processor_phase5g(uuid) to authenticated;
grant execute on function public.bridge_can_assign_bond_manager_phase5g(uuid) to authenticated;
grant execute on function public.bridge_can_assign_bond_compliance_phase5g(uuid) to authenticated;
grant execute on function public.bridge_can_clear_bond_assignment_phase5g(uuid) to authenticated;
grant execute on function public.bridge_can_transfer_bond_application_workspace_phase5g(uuid) to authenticated;
grant execute on function public.bridge_can_override_bond_assignment_scope_phase5g(uuid) to authenticated;
grant execute on function public.bridge_can_override_bond_assignment_scope_phase5f(uuid) to authenticated;
grant execute on function public.bridge_can_mutate_bond_assignment_phase5g(uuid) to authenticated;
grant execute on function public.bridge_can_mutate_bond_sensitive_transaction_phase5g(uuid) to authenticated;

commit;
