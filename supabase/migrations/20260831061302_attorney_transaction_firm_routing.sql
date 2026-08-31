begin;

-- Developer and agent users can nominate an attorney organisation, but the
-- attorney_firms table is intentionally visible only to members of that firm.
-- Resolve the canonical firm behind the transaction-access boundary instead
-- of weakening attorney_firms RLS for every authenticated user.
create or replace function public.bridge_resolve_attorney_firm_for_transaction(
  p_transaction_id uuid,
  p_attorney_firm_id uuid default null,
  p_partner_organisation_id uuid default null,
  p_partner_name text default null,
  p_partner_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_firm_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to resolve an attorney firm.' using errcode = '42501';
  end if;

  if p_transaction_id is null or not public.bridge_can_access_transaction_spine(p_transaction_id) then
    raise exception 'You do not have access to assign an attorney firm to this transaction.' using errcode = '42501';
  end if;

  if p_attorney_firm_id is not null then
    select firm.id
    into v_firm_id
    from public.attorney_firms firm
    where firm.id = p_attorney_firm_id
      and coalesce(firm.is_active, true) = true
    limit 1;
  end if;

  if v_firm_id is null and p_partner_organisation_id is not null then
    select firm.id
    into v_firm_id
    from public.attorney_firms firm
    where firm.organisation_id = p_partner_organisation_id
      and coalesce(firm.is_active, true) = true
    order by firm.updated_at desc nulls last, firm.id
    limit 1;
  end if;

  if v_firm_id is null and p_partner_organisation_id is not null then
    select firm.id
    into v_firm_id
    from public.organisations organisation
    join public.attorney_firms firm
      on firm.id::text = coalesce(
        organisation.settings_json ->> 'attorneyFirmId',
        organisation.settings_json ->> 'attorney_firm_id'
      )
    where organisation.id = p_partner_organisation_id
      and coalesce(firm.is_active, true) = true
    limit 1;
  end if;

  if v_firm_id is null and nullif(lower(trim(coalesce(p_partner_email, ''))), '') is not null then
    select firm.id
    into v_firm_id
    from public.attorney_firms firm
    left join public.organisations organisation on organisation.id = firm.organisation_id
    where coalesce(firm.is_active, true) = true
      and lower(trim(coalesce(p_partner_email, ''))) in (
        lower(trim(coalesce(firm.email, ''))),
        lower(trim(coalesce(organisation.email, ''))),
        lower(trim(coalesce(organisation.company_email, ''))),
        lower(trim(coalesce(organisation.billing_email, '')))
      )
    order by firm.updated_at desc nulls last, firm.id
    limit 1;
  end if;

  if v_firm_id is null and nullif(lower(trim(coalesce(p_partner_name, ''))), '') is not null then
    select firm.id
    into v_firm_id
    from public.attorney_firms firm
    left join public.organisations organisation on organisation.id = firm.organisation_id
    where coalesce(firm.is_active, true) = true
      and lower(trim(coalesce(p_partner_name, ''))) in (
        lower(trim(coalesce(firm.name, ''))),
        lower(trim(coalesce(organisation.name, ''))),
        lower(trim(coalesce(organisation.display_name, ''))),
        lower(trim(coalesce(organisation.legal_name, '')))
      )
    order by firm.updated_at desc nulls last, firm.id
    limit 1;
  end if;

  if v_firm_id is null then
    raise exception 'The selected attorney firm is not linked to an active attorney workspace.' using errcode = '22023';
  end if;

  return v_firm_id;
end;
$$;

revoke all on function public.bridge_resolve_attorney_firm_for_transaction(uuid, uuid, uuid, text, text)
  from public, anon;
grant execute on function public.bridge_resolve_attorney_firm_for_transaction(uuid, uuid, uuid, text, text)
  to authenticated;

comment on function public.bridge_resolve_attorney_firm_for_transaction(uuid, uuid, uuid, text, text) is
  'Resolves a transaction-scoped attorney nomination to its canonical active firm without exposing attorney_firms directory rows through RLS.';

-- Repair the transaction reported with this release. Every statement is
-- idempotent and becomes a no-op when the transaction is absent or already
-- has the canonical transfer-firm records.
with repair_target as (
  select
    transaction_record.id as transaction_id,
    transaction_record.created_by,
    firm.id as firm_id,
    firm.organisation_id,
    firm.name as firm_name,
    firm.email as firm_email
  from public.transactions transaction_record
  join lateral (
    select attorney_firm.*
    from public.attorney_firms attorney_firm
    where coalesce(attorney_firm.is_active, true) = true
      and lower(trim(attorney_firm.name)) = lower(trim(transaction_record.attorney))
    order by attorney_firm.updated_at desc nulls last, attorney_firm.id
    limit 1
  ) firm on true
  where transaction_record.created_at >= '2026-08-31T00:00:00Z'::timestamptz
    and coalesce(transaction_record.is_active, true) = true
    and nullif(trim(coalesce(transaction_record.attorney, '')), '') is not null
)
insert into public.transaction_attorney_assignments (
  transaction_id,
  firm_id,
  attorney_firm_id,
  assignment_type,
  attorney_role,
  matter_type,
  instruction_status,
  assigned_organisation_id,
  scope_level,
  scope_metadata,
  primary_attorney_id,
  attorney_user_id,
  appointment_source,
  firm_acceptance_status,
  staff_assignment_status,
  allocation_state,
  status,
  assignment_status,
  is_primary,
  visibility_scope,
  can_edit,
  can_manage_documents,
  can_manage_signing,
  can_add_internal_notes,
  can_add_shared_updates,
  can_update_workflow_lane,
  assigned_by,
  assigned_at,
  updated_at
)
select
  target.transaction_id,
  target.firm_id,
  target.firm_id,
  'transfer',
  'transfer_attorney',
  'transfer',
  'new_instruction',
  target.organisation_id,
  'organisation',
  jsonb_build_object(
    'source', 'attorney_transaction_firm_routing_repair',
    'roleType', 'transfer_attorney',
    'firmFirstAllocation', true
  ),
  null,
  null,
  'transaction_repair',
  'awaiting_firm_acceptance',
  'awaiting_staff_assignment',
  'awaiting_firm_acceptance',
  'pending',
  'pending',
  true,
  'firm_matter',
  true,
  true,
  true,
  true,
  true,
  true,
  target.created_by,
  now(),
  now()
from repair_target target
where not exists (
  select 1
  from public.transaction_attorney_assignments assignment
  where assignment.transaction_id = target.transaction_id
    and assignment.attorney_role = 'transfer_attorney'
    and coalesce(assignment.assignment_status, assignment.status, 'pending') <> 'removed'
);

with repair_target as (
  select
    transaction_record.id as transaction_id,
    transaction_record.created_by,
    firm.id as firm_id,
    firm.organisation_id,
    firm.name as firm_name,
    firm.email as firm_email
  from public.transactions transaction_record
  join lateral (
    select attorney_firm.*
    from public.attorney_firms attorney_firm
    where coalesce(attorney_firm.is_active, true) = true
      and lower(trim(attorney_firm.name)) = lower(trim(transaction_record.attorney))
    order by attorney_firm.updated_at desc nulls last, attorney_firm.id
    limit 1
  ) firm on true
  where transaction_record.created_at >= '2026-08-31T00:00:00Z'::timestamptz
    and coalesce(transaction_record.is_active, true) = true
    and nullif(trim(coalesce(transaction_record.attorney, '')), '') is not null
)
insert into public.transaction_role_players (
  transaction_id,
  role_type,
  selection_source,
  partner_organisation_id,
  organisation_id,
  assigned_organisation_id,
  scope_level,
  scope_metadata,
  partner_name,
  contact_person,
  email_address,
  status,
  assignment_status,
  activation_trigger,
  assigned_by,
  snapshot_json,
  updated_at
)
select
  target.transaction_id,
  'transfer_attorney',
  'transaction_direct',
  target.organisation_id,
  target.organisation_id,
  target.organisation_id,
  'organisation',
  jsonb_build_object('source', 'attorney_transaction_firm_routing_repair'),
  target.firm_name,
  target.firm_name,
  target.firm_email,
  'selected',
  'selected',
  'appointed_firm_staff_assignment',
  target.created_by,
  jsonb_build_object(
    'canonicalTransactionId', target.transaction_id,
    'roleType', 'transfer_attorney',
    'partnerOrganisationId', target.organisation_id,
    'attorneyFirmId', target.firm_id,
    'firmFirstAllocation', true,
    'roleplayerStatus', 'selected'
  ),
  now()
from repair_target target
where not exists (
  select 1
  from public.transaction_role_players role_player
  where role_player.transaction_id = target.transaction_id
    and role_player.role_type = 'transfer_attorney'
    and role_player.removed_at is null
);

with repair_target as (
  select
    transaction_record.id as transaction_id,
    transaction_record.created_by,
    firm.id as firm_id,
    firm.organisation_id,
    firm.name as firm_name,
    firm.email as firm_email
  from public.transactions transaction_record
  join lateral (
    select attorney_firm.*
    from public.attorney_firms attorney_firm
    where coalesce(attorney_firm.is_active, true) = true
      and lower(trim(attorney_firm.name)) = lower(trim(transaction_record.attorney))
    order by attorney_firm.updated_at desc nulls last, attorney_firm.id
    limit 1
  ) firm on true
  where transaction_record.created_at >= '2026-08-31T00:00:00Z'::timestamptz
    and coalesce(transaction_record.is_active, true) = true
    and nullif(trim(coalesce(transaction_record.attorney, '')), '') is not null
)
insert into public.transaction_participants (
  transaction_id,
  role_type,
  legal_role,
  transaction_role,
  status,
  user_id,
  partner_organisation_id,
  assigned_organisation_id,
  scope_level,
  scope_metadata,
  participant_name,
  participant_email,
  visibility_scope,
  participant_scope,
  assignment_source,
  is_primary,
  can_view,
  can_comment,
  can_upload_documents,
  can_edit_finance_workflow,
  can_edit_attorney_workflow,
  can_edit_core_transaction,
  invited_by_user_id,
  invited_at,
  accepted_at,
  updated_at
)
select
  target.transaction_id,
  'attorney',
  'transfer',
  'transfer_attorney',
  'invited',
  null,
  target.organisation_id,
  target.organisation_id,
  'organisation',
  jsonb_build_object('source', 'attorney_transaction_firm_routing_repair'),
  target.firm_name,
  target.firm_email,
  'shared',
  'transaction',
  'system_inherited',
  true,
  true,
  true,
  true,
  false,
  true,
  false,
  target.created_by,
  now(),
  null,
  now()
from repair_target target
where not exists (
  select 1
  from public.transaction_participants participant
  where participant.transaction_id = target.transaction_id
    and participant.role_type = 'attorney'
    and participant.legal_role = 'transfer'
    and participant.removed_at is null
);

notify pgrst, 'reload schema';

commit;
