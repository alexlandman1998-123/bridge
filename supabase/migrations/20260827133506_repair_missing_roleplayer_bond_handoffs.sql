-- Repair active bond-originator roleplayer selections that saved the partner
-- choice but did not create the canonical finance workflow/application spine.
with eligible_bond_roleplayers as (
  select distinct on (trp.transaction_id)
    trp.transaction_id,
    t.buyer_id,
    coalesce(trp.assigned_organisation_id, trp.organisation_id) as assigned_organisation_id,
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
    end as assigned_user_id,
    coalesce(trp.scope_level, 'organisation') as scope_level,
    coalesce(trp.scope_metadata, '{}'::jsonb) as scope_metadata,
    coalesce(trp.partner_name, trp.contact_person, t.bond_originator) as bond_originator_name,
    trp.email_address as bond_originator_email,
    t.finance_type
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
  order by
    trp.transaction_id,
    case when trp.assigned_user_id is not null then 0 else 1 end,
    trp.updated_at desc nulls last,
    trp.created_at desc nulls last
),
upserted_workflows as (
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
  select
    ebr.transaction_id,
    'bond_hybrid',
    'intake',
    'active',
    'bond_originator',
    'Bond originator intake created from roleplayer handoff',
    now(),
    now(),
    now()
  from eligible_bond_roleplayers ebr
  on conflict (transaction_id, workflow_type)
  do update set
    finance_owner = coalesce(public.transaction_finance_workflows.finance_owner, excluded.finance_owner),
    next_action = coalesce(public.transaction_finance_workflows.next_action, excluded.next_action),
    last_updated_at = now(),
    updated_at = now()
  returning id, transaction_id
),
workflow_scope as (
  select wf.id as workflow_id, ebr.*
  from eligible_bond_roleplayers ebr
  join public.transaction_finance_workflows wf
    on wf.transaction_id = ebr.transaction_id
   and wf.workflow_type = 'bond_hybrid'
),
inserted_applications as (
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
  select
    ws.transaction_id,
    ws.workflow_id,
    ws.buyer_id,
    'originator_intake',
    ws.assigned_organisation_id,
    ws.assigned_region_id,
    ws.assigned_workspace_unit_id,
    ws.assigned_branch_id,
    ws.assigned_team_id,
    ws.assigned_user_id,
    ws.scope_level,
    jsonb_build_object(
      'source',
      'repair_missing_roleplayer_bond_handoffs',
      'roleType',
      'bond_originator'
    ) || coalesce(ws.scope_metadata, '{}'::jsonb),
    case
      when ws.assigned_user_id is not null then 'consultant_assigned'
      when ws.assigned_team_id is not null then 'team_queue'
      when coalesce(ws.assigned_workspace_unit_id, ws.assigned_branch_id) is not null then 'branch_queue'
      when ws.assigned_region_id is not null then 'region_queue'
      else 'organisation_queue'
    end,
    'system_repair',
    'Bond Originator Intake',
    'pending',
    'Bond application workspace repaired from active transaction roleplayer selection.',
    jsonb_build_object(
      'source',
      'repair_missing_roleplayer_bond_handoffs',
      'canonicalStatus',
      'new_application',
      'buyerPartyId',
      ws.buyer_id,
      'assignedOrganisationId',
      ws.assigned_organisation_id,
      'assignedRegionId',
      ws.assigned_region_id,
      'assignedWorkspaceUnitId',
      ws.assigned_workspace_unit_id,
      'assignedBranchId',
      ws.assigned_branch_id,
      'assignedTeamId',
      ws.assigned_team_id,
      'assignedUserId',
      ws.assigned_user_id
    ),
    now(),
    now()
  from workflow_scope ws
  where not exists (
    select 1
    from public.transaction_bond_applications existing
    where existing.transaction_id = ws.transaction_id
      and coalesce(existing.assignment_status, existing.status, 'active') not in (
        'removed',
        'declined',
        'rejected',
        'inactive',
        'suspended'
      )
  )
  returning transaction_id
)
update public.transactions t
set
  bond_originator = coalesce(t.bond_originator, ws.bond_originator_name),
  assigned_bond_originator_email = coalesce(t.assigned_bond_originator_email, ws.bond_originator_email),
  bond_workspace_id = coalesce(t.bond_workspace_id, ws.assigned_organisation_id),
  bond_region_id = coalesce(t.bond_region_id, ws.assigned_region_id),
  bond_workspace_unit_id = coalesce(
    t.bond_workspace_unit_id,
    ws.assigned_workspace_unit_id,
    ws.assigned_branch_id,
    ws.assigned_team_id
  ),
  primary_bond_consultant_user_id = coalesce(t.primary_bond_consultant_user_id, ws.assigned_user_id),
  bond_assignment_status = coalesce(
    t.bond_assignment_status,
    case
      when ws.assigned_user_id is not null then 'consultant_assigned'
      else 'workspace_assigned'
    end
  ),
  bond_assignment_source = coalesce(t.bond_assignment_source, 'system_repair'),
  finance_managed_by = coalesce(t.finance_managed_by, 'bond_originator'),
  finance_status = coalesce(t.finance_status, 'Bond originator assigned'),
  updated_at = now()
from workflow_scope ws
where t.id = ws.transaction_id
  and (
    t.bond_workspace_id is null
    or (t.bond_region_id is null and ws.assigned_region_id is not null)
    or (t.bond_workspace_unit_id is null and coalesce(ws.assigned_workspace_unit_id, ws.assigned_branch_id, ws.assigned_team_id) is not null)
    or (t.primary_bond_consultant_user_id is null and ws.assigned_user_id is not null)
    or t.bond_assignment_status is null
    or t.bond_assignment_source is null
    or t.finance_managed_by is null
    or t.finance_status is null
  );
