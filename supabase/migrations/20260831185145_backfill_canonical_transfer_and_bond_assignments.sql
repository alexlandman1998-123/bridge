begin;

-- Materialise only assignments whose firm ownership is supported by one
-- unambiguous canonical signal. Legacy subprocess rows alone are not ownership
-- evidence and are deliberately left unresolved.
create temporary table bridge_canonical_assignment_backfill_candidates
on commit drop
as
with transfer_evidence as (
  select
    role_player.transaction_id,
    'transfer_attorney'::text as attorney_role,
    firm.id as firm_id,
    case
      when member.user_id is not null then member.user_id
      else null::uuid
    end as attorney_user_id,
    null::uuid as accepted_by,
    null::timestamptz as accepted_at,
    'role_player_organisation'::text as evidence_source
  from public.transaction_role_players role_player
  join public.attorney_firms firm
    on firm.organisation_id = coalesce(
      role_player.assigned_organisation_id,
      role_player.partner_organisation_id,
      role_player.organisation_id
    )
   and coalesce(firm.is_active, true) = true
  left join public.attorney_firm_members member
    on member.firm_id = firm.id
   and member.user_id = coalesce(role_player.assigned_user_id, role_player.user_id)
   and coalesce(member.status, 'active') = 'active'
  join public.transactions transaction_record
    on transaction_record.id = role_player.transaction_id
   and coalesce(transaction_record.is_active, true) = true
   and coalesce(transaction_record.is_demo_data, false) = false
  where role_player.role_type = 'transfer_attorney'
    and role_player.removed_at is null
    and coalesce(role_player.status, role_player.assignment_status, 'selected')
      not in ('removed', 'inactive', 'declined')

  union all

  select
    transaction_record.id,
    'transfer_attorney'::text,
    firm.id,
    null::uuid,
    null::uuid,
    null::timestamptz,
    case
      when nullif(lower(trim(transaction_record.assigned_attorney_email)), '') is not null
       and lower(trim(firm.email)) = lower(trim(transaction_record.assigned_attorney_email))
        then 'transaction_firm_email'
      else 'transaction_firm_name'
    end
  from public.transactions transaction_record
  join public.attorney_firms firm
    on coalesce(firm.is_active, true) = true
   and (
     (
       nullif(lower(trim(transaction_record.attorney)), '') is not null
       and lower(trim(firm.name)) = lower(trim(transaction_record.attorney))
     )
     or (
       nullif(lower(trim(transaction_record.assigned_attorney_email)), '') is not null
       and lower(trim(firm.email)) = lower(trim(transaction_record.assigned_attorney_email))
     )
   )
  where coalesce(transaction_record.is_active, true) = true
    and coalesce(transaction_record.is_demo_data, false) = false

  union all

  select
    transaction_record.id,
    'transfer_attorney'::text,
    member.firm_id,
    profile.id,
    null::uuid,
    null::timestamptz,
    'assigned_attorney_member_email'::text
  from public.transactions transaction_record
  join public.profiles profile
    on nullif(lower(trim(transaction_record.assigned_attorney_email)), '') is not null
   and lower(trim(profile.email)) = lower(trim(transaction_record.assigned_attorney_email))
  join public.attorney_firm_members member
    on member.user_id = profile.id
   and coalesce(member.status, 'active') = 'active'
  join public.attorney_firms firm
    on firm.id = member.firm_id
   and coalesce(firm.is_active, true) = true
  where coalesce(transaction_record.is_active, true) = true
    and coalesce(transaction_record.is_demo_data, false) = false
),
bond_evidence as (
  select
    appointment.transaction_id,
    'bond_attorney'::text as attorney_role,
    appointment.accepted_firm_id as firm_id,
    null::uuid as attorney_user_id,
    appointment.accepted_by,
    appointment.accepted_at,
    'accepted_bank_appointment'::text as evidence_source
  from public.transaction_legal_role_appointments appointment
  join public.attorney_firms firm
    on firm.id = appointment.accepted_firm_id
   and coalesce(firm.is_active, true) = true
  join public.transactions transaction_record
    on transaction_record.id = appointment.transaction_id
   and coalesce(transaction_record.is_active, true) = true
   and coalesce(transaction_record.is_demo_data, false) = false
  where appointment.role_type = 'bond_attorney'
    and appointment.evidence_confirmed = true
    and appointment.coordination_state in ('invite_accepted', 'instruction_confirmed', 'active')
),
all_evidence as (
  select * from transfer_evidence
  union all
  select * from bond_evidence
),
resolved as (
  select
    evidence.transaction_id,
    evidence.attorney_role,
    min(evidence.firm_id::text)::uuid as firm_id,
    case
      when count(distinct evidence.attorney_user_id) = 1
        then min(evidence.attorney_user_id::text)::uuid
      else null::uuid
    end as attorney_user_id,
    (array_agg(evidence.accepted_by order by evidence.accepted_at desc nulls last)
      filter (where evidence.accepted_by is not null))[1] as accepted_by,
    max(evidence.accepted_at) as accepted_at,
    string_agg(distinct evidence.evidence_source, ',' order by evidence.evidence_source) as evidence_sources
  from all_evidence evidence
  group by evidence.transaction_id, evidence.attorney_role
  having count(distinct evidence.firm_id) = 1
)
select * from resolved;

insert into public.transaction_attorney_assignments (
  transaction_id,
  firm_id,
  attorney_firm_id,
  assignment_type,
  matter_type,
  attorney_role,
  primary_attorney_id,
  attorney_user_id,
  assigned_user_id,
  assigned_organisation_id,
  scope_level,
  scope_metadata,
  instruction_status,
  appointment_source,
  firm_acceptance_status,
  firm_accepted_at,
  firm_accepted_by,
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
  candidate.transaction_id,
  candidate.firm_id,
  candidate.firm_id,
  case candidate.attorney_role when 'bond_attorney' then 'bond' else 'transfer' end,
  case candidate.attorney_role when 'bond_attorney' then 'bond' else 'transfer' end,
  candidate.attorney_role,
  candidate.attorney_user_id,
  candidate.attorney_user_id,
  candidate.attorney_user_id,
  firm.organisation_id,
  case when firm.organisation_id is not null then 'organisation' else null end,
  jsonb_build_object(
    'source', 'canonical_attorney_assignment_backfill',
    'evidenceSources', string_to_array(candidate.evidence_sources, ','),
    'firmOwnershipResolved', true
  ),
  'new_instruction',
  'legacy_canonical_backfill',
  case
    when candidate.attorney_role = 'bond_attorney' then 'accepted'
    when candidate.attorney_user_id is not null then 'not_required'
    else 'awaiting_firm_acceptance'
  end,
  case candidate.attorney_role when 'bond_attorney' then candidate.accepted_at else null end,
  case candidate.attorney_role when 'bond_attorney' then candidate.accepted_by else null end,
  case
    when candidate.attorney_user_id is not null then 'staff_assigned'
    else 'awaiting_staff_assignment'
  end,
  case
    when candidate.attorney_user_id is not null then 'staff_assigned'
    when candidate.attorney_role = 'bond_attorney' then 'awaiting_staff_assignment'
    else 'awaiting_firm_acceptance'
  end,
  'pending',
  'pending',
  true,
  case when candidate.attorney_user_id is not null then 'assigned_matter' else 'firm_matter' end,
  true,
  true,
  true,
  true,
  true,
  true,
  candidate.accepted_by,
  coalesce(candidate.accepted_at, now()),
  now()
from bridge_canonical_assignment_backfill_candidates candidate
join public.attorney_firms firm on firm.id = candidate.firm_id
where not exists (
  select 1
  from public.transaction_attorney_assignments assignment
  where assignment.transaction_id = candidate.transaction_id
    and assignment.attorney_role = candidate.attorney_role
    and coalesce(assignment.assignment_status, assignment.status, 'pending') <> 'removed'
);

-- Attach existing workflow lanes only after an assignment has been resolved.
-- A lane is linked only when exactly one current assignment exists for its role.
with assignment_links as (
  select
    assignment.transaction_id,
    assignment.attorney_role,
    min(assignment.id::text)::uuid as assignment_id
  from public.transaction_attorney_assignments assignment
  where assignment.attorney_role in ('transfer_attorney', 'bond_attorney')
    and coalesce(assignment.assignment_status, assignment.status, 'pending') <> 'removed'
  group by assignment.transaction_id, assignment.attorney_role
  having count(*) = 1
)
update public.transaction_subprocesses subprocess
set
  attorney_role = link.attorney_role,
  attorney_assignment_id = link.assignment_id,
  updated_at = now()
from assignment_links link
where subprocess.transaction_id = link.transaction_id
  and subprocess.process_type = case link.attorney_role
    when 'bond_attorney' then 'bond'
    else 'transfer'
  end
  and (
    subprocess.attorney_assignment_id is distinct from link.assignment_id
    or subprocess.attorney_role is distinct from link.attorney_role
  );

do $$
declare
  unresolved_transfer_count integer;
  unresolved_bond_count integer;
begin
  select count(distinct subprocess.transaction_id)
  into unresolved_transfer_count
  from public.transaction_subprocesses subprocess
  where subprocess.process_type = 'transfer'
    and not exists (
      select 1
      from public.transaction_attorney_assignments assignment
      where assignment.transaction_id = subprocess.transaction_id
        and assignment.attorney_role = 'transfer_attorney'
        and coalesce(assignment.assignment_status, assignment.status, 'pending') <> 'removed'
    );

  select count(distinct subprocess.transaction_id)
  into unresolved_bond_count
  from public.transaction_subprocesses subprocess
  where subprocess.process_type = 'bond'
    and not exists (
      select 1
      from public.transaction_attorney_assignments assignment
      where assignment.transaction_id = subprocess.transaction_id
        and assignment.attorney_role = 'bond_attorney'
        and coalesce(assignment.assignment_status, assignment.status, 'pending') <> 'removed'
    );

  raise notice 'Canonical assignment backfill left % transfer and % bond lanes unresolved because no unique accepted firm ownership was available.',
    unresolved_transfer_count,
    unresolved_bond_count;
end;
$$;

commit;
