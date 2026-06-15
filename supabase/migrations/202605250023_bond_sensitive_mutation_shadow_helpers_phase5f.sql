begin;
create or replace function public.bridge_can_submit_bond_to_banks_phase5f(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and public.bridge_can_submit_bond_to_banks_phase5d(transaction_id)
$$;
create or replace function public.bridge_can_assign_bond_workspace_phase5f(transaction_id uuid)
returns boolean
language sql
stable
as $$
  with workspace_target as (
    select public.bridge_bond_transaction_workspace_id(transaction_id) as workspace_id
  )
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and (select workspace_id from workspace_target) is not null
    and public.bridge_is_bond_workspace_hq_member((select workspace_id from workspace_target))
$$;
create or replace function public.bridge_can_assign_bond_region_phase5f(transaction_id uuid)
returns boolean
language sql
stable
as $$
  with workspace_target as (
    select public.bridge_bond_transaction_workspace_id(transaction_id) as workspace_id
  )
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and (
      public.bridge_can_assign_bond_workspace_phase5f(transaction_id)
      or (
        (select workspace_id from workspace_target) is not null
        and public.bridge_current_bond_scope_level((select workspace_id from workspace_target)) = 'region'
        and public.bridge_current_bond_region_id((select workspace_id from workspace_target)) =
          public.bridge_bond_transaction_region_id(transaction_id)
      )
    )
$$;
create or replace function public.bridge_can_assign_bond_unit_phase5f(transaction_id uuid)
returns boolean
language sql
stable
as $$
  with workspace_target as (
    select public.bridge_bond_transaction_workspace_id(transaction_id) as workspace_id
  )
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and (
      public.bridge_can_assign_bond_region_phase5f(transaction_id)
      or (
        (select workspace_id from workspace_target) is not null
        and public.bridge_current_bond_scope_level((select workspace_id from workspace_target)) in ('branch', 'team')
        and public.bridge_current_bond_workspace_unit_id((select workspace_id from workspace_target)) =
          public.bridge_bond_transaction_workspace_unit_id(transaction_id)
      )
    )
$$;
create or replace function public.bridge_can_assign_bond_consultant_phase5f(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and public.bridge_can_manage_bond_assignment_phase5d(transaction_id)
$$;
create or replace function public.bridge_can_assign_bond_processor_phase5f(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and public.bridge_can_manage_bond_assignment_phase5d(transaction_id)
$$;
create or replace function public.bridge_can_assign_bond_manager_phase5f(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and public.bridge_can_manage_bond_assignment_phase5d(transaction_id)
$$;
create or replace function public.bridge_can_assign_bond_compliance_phase5f(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and public.bridge_can_manage_bond_assignment_phase5d(transaction_id)
$$;
create or replace function public.bridge_can_clear_bond_assignment_phase5f(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and public.bridge_can_manage_bond_assignment_phase5d(transaction_id)
$$;
create or replace function public.bridge_can_transfer_bond_application_workspace_phase5f(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and public.bridge_can_assign_bond_workspace_phase5f(transaction_id)
$$;
grant execute on function public.bridge_can_submit_bond_to_banks_phase5f(uuid) to authenticated;
grant execute on function public.bridge_can_assign_bond_workspace_phase5f(uuid) to authenticated;
grant execute on function public.bridge_can_assign_bond_region_phase5f(uuid) to authenticated;
grant execute on function public.bridge_can_assign_bond_unit_phase5f(uuid) to authenticated;
grant execute on function public.bridge_can_assign_bond_consultant_phase5f(uuid) to authenticated;
grant execute on function public.bridge_can_assign_bond_processor_phase5f(uuid) to authenticated;
grant execute on function public.bridge_can_assign_bond_manager_phase5f(uuid) to authenticated;
grant execute on function public.bridge_can_assign_bond_compliance_phase5f(uuid) to authenticated;
grant execute on function public.bridge_can_clear_bond_assignment_phase5f(uuid) to authenticated;
grant execute on function public.bridge_can_transfer_bond_application_workspace_phase5f(uuid) to authenticated;
commit;
