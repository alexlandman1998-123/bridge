begin;

create index if not exists transaction_attorney_assignments_firm_lifecycle_assurance_idx
  on public.transaction_attorney_assignments (transaction_id, attorney_role, allocation_state, updated_at desc);

create or replace view public.transfer_firm_allocation_lifecycle_v2
with (security_invoker = true)
as
select
  tx.id as transaction_id,
  tx.organisation_id,
  tx.listing_id,
  tx.transaction_reference,
  tx.onboarding_status,
  tx.current_main_stage,
  tx.attorney_stage,
  tx.next_action,
  assignment.id as assignment_id,
  coalesce(assignment.attorney_firm_id, assignment.firm_id) as attorney_firm_id,
  assignment.attorney_user_id,
  assignment.primary_attorney_id,
  assignment.preferred_attorney_user_id,
  assignment.appointment_source,
  assignment.preferred_contact_name,
  assignment.preferred_contact_email,
  assignment.firm_acceptance_status,
  assignment.staff_assignment_status,
  assignment.allocation_state,
  assignment.instruction_status,
  assignment.assignment_status,
  assignment.firm_accepted_at,
  assignment.firm_declined_at,
  assignment.allocation_state_changed_at,
  assignment.replaces_assignment_id,
  assignment.replacement_sequence,
  assignment.replacement_reason,
  coalesce(counts.open_assignment_count, 0) as open_assignment_count,
  coalesce(counts.declined_assignment_count, 0) as declined_assignment_count,
  coalesce(roleplayers.active_roleplayer_count, 0) as active_roleplayer_count,
  extract(epoch from (now() - coalesce(assignment.allocation_state_changed_at, assignment.updated_at))) / 3600.0 as hours_in_allocation_state,
  case
    when assignment.id is null and lower(coalesce(tx.onboarding_status, '')) in ('signed_otp_received', 'otp_uploaded') then 'instruction_missing'
    when assignment.id is null then 'awaiting_instruction'
    else assignment.allocation_state
  end as lifecycle_stage,
  case
    when assignment.allocation_state = 'awaiting_firm_acceptance' then 'accept_or_decline_firm_nomination'
    when assignment.allocation_state = 'awaiting_staff_assignment' then 'assign_primary_attorney'
    when assignment.allocation_state = 'staff_assigned' then 'activate_transfer_matter'
    when assignment.allocation_state = 'declined' then 'nominate_replacement_firm'
    else null
  end as required_action,
  case
    when coalesce(counts.open_assignment_count, 0) > 1 then 'blocked'
    when assignment.allocation_state = 'awaiting_staff_assignment' and assignment.firm_acceptance_status <> 'accepted' then 'blocked'
    when assignment.allocation_state = 'awaiting_staff_assignment' and coalesce(assignment.attorney_user_id, assignment.primary_attorney_id) is not null then 'blocked'
    when assignment.allocation_state = 'staff_assigned' and (
      assignment.staff_assignment_status <> 'staff_assigned'
      or coalesce(assignment.attorney_user_id, assignment.primary_attorney_id) is null
    ) then 'blocked'
    when assignment.allocation_state = 'active' and (
      assignment.firm_acceptance_status <> 'accepted'
      or assignment.staff_assignment_status <> 'staff_assigned'
      or coalesce(assignment.attorney_user_id, assignment.primary_attorney_id) is null
      or assignment.instruction_status <> 'accepted'
    ) then 'blocked'
    when assignment.allocation_state = 'declined' and coalesce(roleplayers.active_roleplayer_count, 0) > 0 then 'blocked'
    when assignment.id is null and lower(coalesce(tx.onboarding_status, '')) in ('signed_otp_received', 'otp_uploaded') then 'attention'
    when assignment.allocation_state = 'awaiting_firm_acceptance'
      and now() - coalesce(assignment.allocation_state_changed_at, assignment.updated_at) > interval '48 hours' then 'attention'
    when assignment.allocation_state = 'awaiting_staff_assignment'
      and now() - coalesce(assignment.allocation_state_changed_at, assignment.updated_at) > interval '24 hours' then 'attention'
    when assignment.allocation_state = 'declined' then 'attention'
    else 'on_track'
  end as lifecycle_health,
  case
    when coalesce(counts.open_assignment_count, 0) > 1 then 'multiple_open_transfer_firm_allocations'
    when assignment.allocation_state = 'awaiting_staff_assignment' and assignment.firm_acceptance_status <> 'accepted' then 'staff_assignment_open_before_firm_acceptance'
    when assignment.allocation_state = 'awaiting_staff_assignment' and coalesce(assignment.attorney_user_id, assignment.primary_attorney_id) is not null then 'person_linked_before_internal_assignment'
    when assignment.allocation_state = 'staff_assigned' and (
      assignment.staff_assignment_status <> 'staff_assigned'
      or coalesce(assignment.attorney_user_id, assignment.primary_attorney_id) is null
    ) then 'staff_assigned_state_missing_primary_attorney'
    when assignment.allocation_state = 'active' and (
      assignment.firm_acceptance_status <> 'accepted'
      or assignment.staff_assignment_status <> 'staff_assigned'
      or coalesce(assignment.attorney_user_id, assignment.primary_attorney_id) is null
      or assignment.instruction_status <> 'accepted'
    ) then 'active_matter_missing_firm_or_person_gate'
    when assignment.allocation_state = 'declined' and coalesce(roleplayers.active_roleplayer_count, 0) > 0 then 'declined_firm_still_has_active_roleplayer'
    when assignment.id is null and lower(coalesce(tx.onboarding_status, '')) in ('signed_otp_received', 'otp_uploaded') then 'missing_instruction_assignment'
    when assignment.allocation_state = 'awaiting_firm_acceptance'
      and now() - coalesce(assignment.allocation_state_changed_at, assignment.updated_at) > interval '48 hours' then 'firm_acceptance_sla_overdue'
    when assignment.allocation_state = 'awaiting_staff_assignment'
      and now() - coalesce(assignment.allocation_state_changed_at, assignment.updated_at) > interval '24 hours' then 'internal_assignment_sla_overdue'
    when assignment.allocation_state = 'declined' then 'replacement_firm_required'
    else null
  end as lifecycle_issue,
  greatest(coalesce(tx.updated_at, '-infinity'::timestamptz), coalesce(assignment.updated_at, '-infinity'::timestamptz)) as lifecycle_updated_at
from public.transactions tx
left join lateral (
  select candidate.*
  from public.transaction_attorney_assignments candidate
  where candidate.transaction_id = tx.id
    and (candidate.attorney_role = 'transfer_attorney' or candidate.assignment_type in ('transfer', 'transfer_and_bond'))
  order by
    case when candidate.allocation_state not in ('declined', 'removed') then 0 else 1 end,
    candidate.replacement_sequence desc,
    candidate.updated_at desc
  limit 1
) assignment on true
left join lateral (
  select
    count(*) filter (where candidate.allocation_state not in ('declined', 'removed'))::integer as open_assignment_count,
    count(*) filter (where candidate.allocation_state = 'declined')::integer as declined_assignment_count
  from public.transaction_attorney_assignments candidate
  where candidate.transaction_id = tx.id
    and (candidate.attorney_role = 'transfer_attorney' or candidate.assignment_type in ('transfer', 'transfer_and_bond'))
) counts on true
left join lateral (
  select count(*)::integer as active_roleplayer_count
  from public.transaction_role_players roleplayer
  where roleplayer.transaction_id = tx.id
    and roleplayer.role_type = 'transfer_attorney'
    and coalesce(roleplayer.assignment_status, roleplayer.status, 'selected') not in ('removed', 'declined', 'rejected')
) roleplayers on true
where assignment.id is not null or tx.listing_id is not null;

grant select on public.transfer_firm_allocation_lifecycle_v2 to authenticated;

comment on view public.transfer_firm_allocation_lifecycle_v2 is
  'Phase 7 read-only assurance model for firm nomination, firm acceptance, internal primary assignment, activation, replacement lineage, and SLA drift.';

commit;
