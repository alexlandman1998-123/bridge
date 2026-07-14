begin;

create index if not exists private_listing_role_players_lifecycle_idx
  on public.private_listing_role_players(private_listing_id, selected_at desc, allocation_status);

create index if not exists transaction_attorney_assignments_lifecycle_idx
  on public.transaction_attorney_assignments(transaction_id, updated_at desc, instruction_status);

create or replace view public.transfer_instruction_lifecycle_v1
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
  allocation.id as allocation_id,
  allocation.company_name as allocated_attorney_name,
  allocation.partner_organisation_id as allocated_attorney_organisation_id,
  allocation.allocation_status,
  allocation.selected_at as attorney_selected_at,
  allocation.instructed_at,
  allocation.instruction_accepted_at,
  allocation.instruction_declined_at,
  assignment.id as assignment_id,
  assignment.attorney_firm_id,
  assignment.instruction_status,
  assignment.assignment_status,
  assignment.instruction_accepted_at as assignment_accepted_at,
  assignment.instruction_declined_at as assignment_declined_at,
  coalesce(assignment_counts.active_count, 0) as active_assignment_count,
  coalesce(roleplayer_counts.active_count, 0) as active_roleplayer_count,
  case
    when assignment.instruction_status = 'accepted' then 'matter_active'
    when assignment.instruction_status = 'declined' then 'reassignment_required'
    when assignment.instruction_status = 'ready_for_acceptance' then 'awaiting_attorney_acceptance'
    when lower(coalesce(tx.onboarding_status, '')) in ('signed_otp_received', 'otp_uploaded')
      and assignment.id is null then 'instruction_missing'
    when lower(coalesce(tx.onboarding_status, '')) in ('signed_otp_received', 'otp_uploaded') then 'instruction_preparing'
    when lower(coalesce(tx.onboarding_status, '')) in ('awaiting_signed_otp', 'client_onboarding_complete', 'completed') then 'awaiting_signed_otp'
    when tx.id is not null then 'buyer_onboarding'
    else 'mandate_allocation'
  end as lifecycle_stage,
  case
    when coalesce(assignment_counts.active_count, 0) > 1 then 'blocked'
    when assignment.instruction_status = 'declined' and coalesce(roleplayer_counts.active_count, 0) > 0 then 'blocked'
    when assignment.instruction_status = 'accepted' and coalesce(allocation.allocation_status, '') <> 'converted' then 'attention'
    when lower(coalesce(tx.onboarding_status, '')) in ('signed_otp_received', 'otp_uploaded') and assignment.id is null then 'attention'
    when allocation.allocation_status in ('instructed', 'converted') and allocation.transaction_id is null then 'attention'
    when assignment.instruction_status = 'declined' then 'blocked'
    else 'on_track'
  end as lifecycle_health,
  case
    when coalesce(assignment_counts.active_count, 0) > 1 then 'multiple_active_transfer_assignments'
    when assignment.instruction_status = 'declined' and coalesce(roleplayer_counts.active_count, 0) > 0 then 'declined_attorney_still_active'
    when assignment.instruction_status = 'accepted' and coalesce(allocation.allocation_status, '') <> 'converted' then 'accepted_allocation_not_converted'
    when lower(coalesce(tx.onboarding_status, '')) in ('signed_otp_received', 'otp_uploaded') and assignment.id is null then 'missing_instruction_assignment'
    when allocation.allocation_status in ('instructed', 'converted') and allocation.transaction_id is null then 'allocation_missing_transaction_link'
    when assignment.instruction_status = 'declined' then 'replacement_attorney_required'
    else null
  end as lifecycle_issue,
  greatest(
    coalesce(tx.updated_at, '-infinity'::timestamptz),
    coalesce(allocation.updated_at, '-infinity'::timestamptz),
    coalesce(assignment.updated_at, '-infinity'::timestamptz)
  ) as lifecycle_updated_at
from public.transactions tx
left join lateral (
  select allocation_row.*
  from public.private_listing_role_players allocation_row
  where allocation_row.private_listing_id = tx.listing_id
    and allocation_row.role_type = 'transfer_attorney'
  order by allocation_row.selected_at desc
  limit 1
) allocation on true
left join lateral (
  select assignment_row.*
  from public.transaction_attorney_assignments assignment_row
  where assignment_row.transaction_id = tx.id
    and (
      assignment_row.attorney_role = 'transfer_attorney'
      or assignment_row.assignment_type in ('transfer', 'transfer_and_bond')
      or assignment_row.matter_type in ('transfer', 'transfer_and_bond')
    )
  order by
    case assignment_row.instruction_status
      when 'accepted' then 1
      when 'ready_for_acceptance' then 2
      when 'declined' then 3
      else 4
    end,
    assignment_row.updated_at desc
  limit 1
) assignment on true
left join lateral (
  select count(*)::integer as active_count
  from public.transaction_attorney_assignments active_assignment
  where active_assignment.transaction_id = tx.id
    and (
      active_assignment.attorney_role = 'transfer_attorney'
      or active_assignment.assignment_type in ('transfer', 'transfer_and_bond')
      or active_assignment.matter_type in ('transfer', 'transfer_and_bond')
    )
    and coalesce(active_assignment.assignment_status, active_assignment.status, 'active') not in ('removed', 'completed')
    and coalesce(active_assignment.instruction_status, '') <> 'declined'
) assignment_counts on true
left join lateral (
  select count(*)::integer as active_count
  from public.transaction_role_players active_roleplayer
  where active_roleplayer.transaction_id = tx.id
    and active_roleplayer.role_type = 'transfer_attorney'
    and coalesce(active_roleplayer.assignment_status, active_roleplayer.status, 'selected') not in ('removed', 'declined', 'rejected')
) roleplayer_counts on true
where tx.listing_id is not null;

grant select on public.transfer_instruction_lifecycle_v1 to authenticated;

comment on view public.transfer_instruction_lifecycle_v1 is
  'Phase 7 assurance read model for the complete mandate-to-transfer-instruction lifecycle, including reconciliation health flags.';

commit;

