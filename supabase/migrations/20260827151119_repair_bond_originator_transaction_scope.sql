-- Backfill bond-originator transaction scope from the canonical bond application
-- table so HQ-level bond queues can resolve existing developer-created matters.
with ranked_bond_applications as (
  select
    tba.transaction_id,
    tba.assigned_organisation_id,
    tba.assigned_region_id,
    coalesce(tba.assigned_workspace_unit_id, tba.assigned_branch_id, tba.assigned_team_id) as assigned_workspace_unit_id,
    case
      when exists (
        select 1
        from auth.users au
        where au.id = tba.assigned_user_id
      )
      then tba.assigned_user_id
      else null
    end as assigned_user_id,
    row_number() over (
      partition by tba.transaction_id
      order by
        case when tba.assigned_user_id is not null then 0 else 1 end,
        tba.updated_at desc nulls last,
        tba.created_at desc nulls last
    ) as rank
  from public.transaction_bond_applications tba
  where tba.assigned_organisation_id is not null
    and coalesce(tba.assignment_status, tba.status, 'active') not in (
      'removed',
      'declined',
      'rejected',
      'inactive',
      'suspended'
    )
)
update public.transactions t
set
  bond_workspace_id = coalesce(t.bond_workspace_id, rba.assigned_organisation_id),
  bond_region_id = coalesce(t.bond_region_id, rba.assigned_region_id),
  bond_workspace_unit_id = coalesce(t.bond_workspace_unit_id, rba.assigned_workspace_unit_id),
  primary_bond_consultant_user_id = coalesce(t.primary_bond_consultant_user_id, rba.assigned_user_id),
  bond_assignment_status = coalesce(
    t.bond_assignment_status,
    case
      when rba.assigned_user_id is not null then 'consultant_assigned'
      else 'workspace_assigned'
    end
  ),
  bond_assignment_source = coalesce(t.bond_assignment_source, 'system_repair'),
  finance_managed_by = coalesce(t.finance_managed_by, 'bond_originator'),
  finance_status = coalesce(t.finance_status, 'Bond originator assigned'),
  updated_at = now()
from ranked_bond_applications rba
where rba.rank = 1
  and t.id = rba.transaction_id
  and coalesce(t.is_active, true) = true
  and (
    t.bond_workspace_id is null
    or (t.bond_region_id is null and rba.assigned_region_id is not null)
    or (t.bond_workspace_unit_id is null and rba.assigned_workspace_unit_id is not null)
    or (t.primary_bond_consultant_user_id is null and rba.assigned_user_id is not null)
    or t.bond_assignment_status is null
    or t.bond_assignment_source is null
    or t.finance_managed_by is null
    or t.finance_status is null
  );
