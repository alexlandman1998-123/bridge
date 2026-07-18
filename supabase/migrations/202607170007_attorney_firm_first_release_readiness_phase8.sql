begin;

create or replace view public.transfer_firm_allocation_release_readiness_v1
with (security_invoker = true)
as
select
  lifecycle.organisation_id,
  count(*)::integer as transaction_count,
  count(*) filter (where lifecycle.lifecycle_health = 'on_track')::integer as healthy_count,
  count(*) filter (where lifecycle.lifecycle_health = 'attention')::integer as attention_count,
  count(*) filter (where lifecycle.lifecycle_health = 'blocked')::integer as blocked_count,
  count(*) filter (where lifecycle.lifecycle_issue = 'firm_acceptance_sla_overdue')::integer as firm_acceptance_overdue_count,
  count(*) filter (where lifecycle.lifecycle_issue = 'internal_assignment_sla_overdue')::integer as internal_assignment_overdue_count,
  count(*) filter (where lifecycle.allocation_state = 'awaiting_firm_acceptance')::integer as awaiting_firm_acceptance_count,
  count(*) filter (where lifecycle.allocation_state = 'awaiting_staff_assignment')::integer as awaiting_staff_assignment_count,
  count(*) filter (where lifecycle.allocation_state = 'staff_assigned')::integer as staff_assigned_count,
  count(*) filter (where lifecycle.allocation_state = 'active')::integer as active_count,
  count(*) filter (where lifecycle.allocation_state = 'declined')::integer as declined_count,
  count(*) filter (where lifecycle.replaces_assignment_id is not null)::integer as replacement_count,
  case
    when count(*) filter (where lifecycle.lifecycle_health = 'blocked') > 0 then 'blocked'
    when count(*) filter (where lifecycle.lifecycle_health = 'attention') > 0 then 'warning'
    else 'pass'
  end as rollout_status,
  max(lifecycle.lifecycle_updated_at) as last_lifecycle_update
from public.transfer_firm_allocation_lifecycle_v2 lifecycle
group by lifecycle.organisation_id;

create or replace view public.transfer_firm_allocation_reconciliation_candidates_v1
with (security_invoker = true)
as
select
  lifecycle.transaction_id,
  lifecycle.organisation_id,
  lifecycle.assignment_id,
  lifecycle.attorney_firm_id,
  lifecycle.allocation_state,
  lifecycle.lifecycle_health,
  lifecycle.lifecycle_issue,
  lifecycle.required_action,
  lifecycle.hours_in_allocation_state,
  lifecycle.replaces_assignment_id,
  lifecycle.replacement_sequence,
  case lifecycle.lifecycle_issue
    when 'multiple_open_transfer_firm_allocations' then 'Review duplicate open allocations and retain the valid lineage manually.'
    when 'staff_assignment_open_before_firm_acceptance' then 'Review acceptance evidence before correcting the lifecycle state.'
    when 'person_linked_before_internal_assignment' then 'Confirm the firm decision and internal allocation before retaining the person link.'
    when 'staff_assigned_state_missing_primary_attorney' then 'Assign an eligible active primary attorney from the nominated firm.'
    when 'active_matter_missing_firm_or_person_gate' then 'Suspend progression and reconcile firm acceptance, primary attorney, and instruction evidence.'
    when 'declined_firm_still_has_active_roleplayer' then 'Remove stale declined-firm access before nominating a replacement.'
    when 'missing_instruction_assignment' then 'Replay the signed-OTP legal handoff after validating the nominated firm.'
    when 'firm_acceptance_sla_overdue' then 'Follow up with the nominated firm or record a decline and replacement.'
    when 'internal_assignment_sla_overdue' then 'Escalate internal primary-attorney allocation to the firm administrator.'
    when 'replacement_firm_required' then 'Nominate a different replacement transfer attorney firm.'
    else 'Review the lifecycle evidence before making any correction.'
  end as recommended_resolution,
  false as automatic_repair_allowed,
  lifecycle.lifecycle_updated_at
from public.transfer_firm_allocation_lifecycle_v2 lifecycle
where lifecycle.lifecycle_health in ('attention', 'blocked');

grant select on public.transfer_firm_allocation_release_readiness_v1 to authenticated;
grant select on public.transfer_firm_allocation_reconciliation_candidates_v1 to authenticated;

comment on view public.transfer_firm_allocation_release_readiness_v1 is
  'Phase 8 organisation-scoped rollout gate for the firm-first transfer allocation lifecycle.';
comment on view public.transfer_firm_allocation_reconciliation_candidates_v1 is
  'Phase 8 advisory-only reconciliation queue. Automatic repair is deliberately disabled so allocation history is never silently rewritten.';

commit;
