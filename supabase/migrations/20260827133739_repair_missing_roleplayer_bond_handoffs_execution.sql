-- Explicitly execute the missing bond handoff repair for active roleplayer
-- selections. This intentionally avoids unreferenced data-modifying CTEs.
insert into public.transaction_finance_workflows (
  transaction_id,
  workflow_type,
  current_stage,
  status,
  finance_owner,
  next_action,
  last_updated_at,
  created_at,
  updated_at
)
select distinct
  trp.transaction_id,
  'bond_hybrid',
  'intake',
  'active',
  'bond_originator',
  'Bond originator intake created from roleplayer handoff',
  now(),
  now(),
  now()
from public.transaction_role_players trp
join public.transactions t on t.id = trp.transaction_id
where trp.role_type = 'bond_originator'
  and trp.removed_at is null
  and coalesce(trp.assignment_status, trp.status, 'active') not in (
    'removed',
    'declined',
    'rejected',
    'inactive',
    'suspended'
  )
  and coalesce(trp.assigned_organisation_id, trp.organisation_id) is not null
  and coalesce(t.is_active, true) = true
  and lower(coalesce(t.finance_type, '')) not in ('', 'cash')
  and not exists (
    select 1
    from public.transaction_bond_applications tba
    where tba.transaction_id = trp.transaction_id
      and coalesce(tba.assignment_status, tba.status, 'active') not in (
        'removed',
        'declined',
        'rejected',
        'inactive',
        'suspended'
      )
  )
on conflict (transaction_id, workflow_type)
do update set
  finance_owner = coalesce(public.transaction_finance_workflows.finance_owner, excluded.finance_owner),
  next_action = coalesce(public.transaction_finance_workflows.next_action, excluded.next_action),
  last_updated_at = now(),
  updated_at = now();

insert into public.transaction_bond_applications (
  transaction_id,
  workflow_id,
  buyer_party_id,
  application_type,
  assigned_organisation_id,
  assigned_region_id,
  assigned_workspace_unit_id,
  assigned_branch_id,
  assigned_team_id,
  assigned_user_id,
  scope_level,
  scope_metadata,
  assignment_status,
  assignment_source,
  bank_name,
  status,
  notes,
  metadata,
  created_at,
  updated_at
)
select distinct on (trp.transaction_id)
  trp.transaction_id,
  wf.id,
  t.buyer_id,
  'originator_intake',
  coalesce(trp.assigned_organisation_id, trp.organisation_id),
  trp.assigned_region_id,
  trp.assigned_workspace_unit_id,
  trp.assigned_branch_id,
  trp.assigned_team_id,
  case
    when exists (
      select 1
      from auth.users au
      where au.id = trp.assigned_user_id
    )
    then trp.assigned_user_id
    else null
  end,
  coalesce(trp.scope_level, 'organisation'),
  jsonb_build_object(
    'source',
    'repair_missing_roleplayer_bond_handoffs_execution',
    'roleType',
    'bond_originator'
  ) || coalesce(trp.scope_metadata, '{}'::jsonb),
  case
    when trp.assigned_user_id is not null then 'consultant_assigned'
    when trp.assigned_team_id is not null then 'team_queue'
    when coalesce(trp.assigned_workspace_unit_id, trp.assigned_branch_id) is not null then 'branch_queue'
    when trp.assigned_region_id is not null then 'region_queue'
    else 'organisation_queue'
  end,
  'system_repair',
  'Bond Originator Intake',
  'pending',
  'Bond application workspace repaired from active transaction roleplayer selection.',
  jsonb_build_object(
    'source',
    'repair_missing_roleplayer_bond_handoffs_execution',
    'canonicalStatus',
    'new_application',
    'buyerPartyId',
    t.buyer_id,
    'assignedOrganisationId',
    coalesce(trp.assigned_organisation_id, trp.organisation_id),
    'assignedRegionId',
    trp.assigned_region_id,
    'assignedWorkspaceUnitId',
    trp.assigned_workspace_unit_id,
    'assignedBranchId',
    trp.assigned_branch_id,
    'assignedTeamId',
    trp.assigned_team_id,
    'assignedUserId',
    trp.assigned_user_id
  ),
  now(),
  now()
from public.transaction_role_players trp
join public.transactions t on t.id = trp.transaction_id
join public.transaction_finance_workflows wf
  on wf.transaction_id = trp.transaction_id
 and wf.workflow_type = 'bond_hybrid'
where trp.role_type = 'bond_originator'
  and trp.removed_at is null
  and coalesce(trp.assignment_status, trp.status, 'active') not in (
    'removed',
    'declined',
    'rejected',
    'inactive',
    'suspended'
  )
  and coalesce(trp.assigned_organisation_id, trp.organisation_id) is not null
  and coalesce(t.is_active, true) = true
  and lower(coalesce(t.finance_type, '')) not in ('', 'cash')
  and not exists (
    select 1
    from public.transaction_bond_applications tba
    where tba.transaction_id = trp.transaction_id
      and coalesce(tba.assignment_status, tba.status, 'active') not in (
        'removed',
        'declined',
        'rejected',
        'inactive',
        'suspended'
      )
  )
order by
  trp.transaction_id,
  case when trp.assigned_user_id is not null then 0 else 1 end,
  trp.updated_at desc nulls last,
  trp.created_at desc nulls last;

update public.transactions t
set
  bond_originator = coalesce(t.bond_originator, coalesce(trp.partner_name, trp.contact_person)),
  assigned_bond_originator_email = coalesce(t.assigned_bond_originator_email, trp.email_address),
  bond_workspace_id = coalesce(t.bond_workspace_id, coalesce(trp.assigned_organisation_id, trp.organisation_id)),
  bond_region_id = coalesce(t.bond_region_id, trp.assigned_region_id),
  bond_workspace_unit_id = coalesce(
    t.bond_workspace_unit_id,
    trp.assigned_workspace_unit_id,
    trp.assigned_branch_id,
    trp.assigned_team_id
  ),
  primary_bond_consultant_user_id = coalesce(
    t.primary_bond_consultant_user_id,
    case
      when exists (
        select 1
        from auth.users au
        where au.id = trp.assigned_user_id
      )
      then trp.assigned_user_id
      else null
    end
  ),
  bond_assignment_status = coalesce(
    t.bond_assignment_status,
    case
      when trp.assigned_user_id is not null then 'consultant_assigned'
      else 'workspace_assigned'
    end
  ),
  bond_assignment_source = coalesce(t.bond_assignment_source, 'system_repair'),
  finance_managed_by = coalesce(t.finance_managed_by, 'bond_originator'),
  finance_status = coalesce(t.finance_status, 'Bond originator assigned'),
  updated_at = now()
from public.transaction_role_players trp
where t.id = trp.transaction_id
  and trp.role_type = 'bond_originator'
  and trp.removed_at is null
  and coalesce(trp.assignment_status, trp.status, 'active') not in (
    'removed',
    'declined',
    'rejected',
    'inactive',
    'suspended'
  )
  and coalesce(trp.assigned_organisation_id, trp.organisation_id) is not null
  and coalesce(t.is_active, true) = true
  and lower(coalesce(t.finance_type, '')) not in ('', 'cash')
  and exists (
    select 1
    from public.transaction_bond_applications tba
    where tba.transaction_id = t.id
      and tba.assigned_organisation_id = coalesce(trp.assigned_organisation_id, trp.organisation_id)
      and coalesce(tba.assignment_status, tba.status, 'active') not in (
        'removed',
        'declined',
        'rejected',
        'inactive',
        'suspended'
      )
  )
  and (
    t.bond_workspace_id is null
    or (t.bond_region_id is null and trp.assigned_region_id is not null)
    or (t.bond_workspace_unit_id is null and coalesce(trp.assigned_workspace_unit_id, trp.assigned_branch_id, trp.assigned_team_id) is not null)
    or (t.primary_bond_consultant_user_id is null and trp.assigned_user_id is not null)
    or t.bond_assignment_status is null
    or t.bond_assignment_source is null
    or t.finance_managed_by is null
    or t.finance_status is null
  );
