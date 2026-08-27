-- Align universal transaction participant scope with active roleplayer
-- selections where the participant row exists but scope columns are blank.
with scoped_roleplayers as (
  select distinct on (
    trp.transaction_id,
    case when trp.role_type = 'bond_originator' then 'bond_originator' else 'attorney' end
  )
    trp.transaction_id,
    case when trp.role_type = 'bond_originator' then 'bond_originator' else 'attorney' end as participant_role_type,
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
    coalesce(trp.scope_metadata, '{}'::jsonb) as scope_metadata
  from public.transaction_role_players trp
  join public.transactions t on t.id = trp.transaction_id
  where trp.role_type in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney', 'bond_originator')
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
  order by
    trp.transaction_id,
    case when trp.role_type = 'bond_originator' then 'bond_originator' else 'attorney' end,
    case when trp.assigned_user_id is not null then 0 else 1 end,
    trp.updated_at desc nulls last,
    trp.created_at desc nulls last
)
update public.transaction_participants tp
set
  assigned_organisation_id = coalesce(tp.assigned_organisation_id, sr.assigned_organisation_id),
  assigned_region_id = coalesce(tp.assigned_region_id, sr.assigned_region_id),
  assigned_workspace_unit_id = coalesce(tp.assigned_workspace_unit_id, sr.assigned_workspace_unit_id),
  assigned_branch_id = coalesce(tp.assigned_branch_id, sr.assigned_branch_id),
  assigned_team_id = coalesce(tp.assigned_team_id, sr.assigned_team_id),
  assigned_user_id = coalesce(tp.assigned_user_id, sr.assigned_user_id),
  scope_level = coalesce(tp.scope_level, sr.scope_level),
  scope_metadata = case
    when tp.scope_metadata is null or tp.scope_metadata = '{}'::jsonb then
      jsonb_build_object('source', 'repair_roleplayer_participant_scope_alignment') ||
      coalesce(sr.scope_metadata, '{}'::jsonb)
    else tp.scope_metadata
  end,
  updated_at = now()
from scoped_roleplayers sr
where tp.transaction_id = sr.transaction_id
  and tp.role_type = sr.participant_role_type
  and tp.removed_at is null
  and coalesce(tp.status, 'active') not in (
    'removed',
    'declined',
    'rejected',
    'inactive',
    'suspended'
  )
  and (
    tp.assigned_organisation_id is null
    or (tp.assigned_region_id is null and sr.assigned_region_id is not null)
    or (tp.assigned_workspace_unit_id is null and sr.assigned_workspace_unit_id is not null)
    or (tp.assigned_branch_id is null and sr.assigned_branch_id is not null)
    or (tp.assigned_team_id is null and sr.assigned_team_id is not null)
    or (tp.assigned_user_id is null and sr.assigned_user_id is not null)
    or tp.scope_level is null
    or tp.scope_metadata is null
    or tp.scope_metadata = '{}'::jsonb
  );
