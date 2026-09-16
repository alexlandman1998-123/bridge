-- Backfill the two Productive example transactions that were created before
-- the organisation-level partner workspace hand-off existed.
insert into public.transaction_partner_assignments (
  transaction_id,
  agency_organisation_id,
  partner_organisation_id,
  partner_connection_id,
  partner_service_type,
  partner_role,
  assigned_person_id,
  assigned_queue_id,
  delivery_type,
  assignment_status,
  source,
  created_by,
  activated_at,
  pending_work_delivery
)
select
  role_player.transaction_id,
  transaction.organisation_id,
  coalesce(role_player.assigned_organisation_id, role_player.partner_organisation_id, role_player.organisation_id),
  null,
  case when role_player.role_type = 'bond_originator' then 'bond_origination' else 'property_transfers' end,
  role_player.role_type,
  null,
  null,
  case when role_player.role_type = 'bond_originator' then 'bond_application_request' else 'attorney_instruction' end,
  'active',
  'import',
  role_player.assigned_by,
  now(),
  jsonb_build_object(
    'source', 'emergency_produktive_backfill',
    'rolePlayerId', role_player.id,
    'roleType', role_player.role_type,
    'organisationLevelAssignment', true
  )
from public.transaction_role_players role_player
join public.transactions transaction on transaction.id = role_player.transaction_id
where role_player.transaction_id in (
  '0b31a096-ea2e-483b-ab81-784a4b7739cf',
  'dad60353-5f9f-4e0c-8473-b344bf53e5bb'
)
  and role_player.role_type in ('transfer_attorney', 'bond_originator')
  and transaction.organisation_id = 'efa6c6ff-6941-4b59-8bcb-e4d9ba9e585a'
  and coalesce(role_player.assigned_organisation_id, role_player.partner_organisation_id, role_player.organisation_id) is not null
  and not exists (
    select 1
    from public.transaction_partner_assignments assignment
    where assignment.transaction_id = role_player.transaction_id
      and assignment.partner_organisation_id = coalesce(role_player.assigned_organisation_id, role_player.partner_organisation_id, role_player.organisation_id)
      and assignment.partner_role = role_player.role_type
      and assignment.assignment_status not in ('cancelled', 'declined', 'completed')
  );
