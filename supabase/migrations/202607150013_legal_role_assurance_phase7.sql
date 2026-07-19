begin;
create index if not exists transaction_legal_role_appointments_assurance_idx
  on public.transaction_legal_role_appointments (transaction_id, role_type, coordination_state, updated_at desc);
create or replace view public.legal_role_coordination_assurance_v1
with (security_invoker = true)
as
with assurance_base as (
  select
    appointment.*,
    transaction.organisation_id,
    invitation.status as invitation_status,
    invitation.organisation_id as invitation_organisation_id,
    replacement.appointment_id as superseded_by_appointment_id,
    coalesce(assignment.live_assignment_count, 0) as live_assignment_count,
    coalesce(assignment.primary_user_count, 0) as primary_user_count,
    coalesce(assignment.accepted_instruction_count, 0) as accepted_instruction_count,
    coalesce(assignment.mismatched_firm_count, 0) as mismatched_firm_count,
    coalesce(role_player.live_role_player_count, 0) as live_role_player_count,
    coalesce(role_player.active_role_player_count, 0) as active_role_player_count,
    coalesce(role_player.mismatched_organisation_count, 0) as mismatched_organisation_count,
    case
      when appointment.coordination_state = 'invite_sent' then 'firm_acceptance'
      when appointment.coordination_state = 'invite_accepted'
        and appointment.staff_assignment_status <> 'staff_assigned' then 'staff_assignment'
      when appointment.coordination_state = 'invite_accepted' then 'bank_instruction'
      when appointment.coordination_state = 'instruction_confirmed' then 'instruction_decision'
      when appointment.coordination_state = 'replacement_required'
        and replacement.appointment_id is not null then 'superseded'
      when appointment.coordination_state = 'replacement_required' then 'replacement_appointment'
      when appointment.coordination_state = 'active' then 'complete'
      else 'appointment_coordination'
    end as next_action_key,
    case
      when appointment.coordination_state = 'invite_sent'
        then coalesce(invitation.created_at, appointment.updated_at) + interval '2 days'
      when appointment.coordination_state = 'invite_accepted'
        and appointment.staff_assignment_status <> 'staff_assigned'
        then coalesce(appointment.accepted_at, appointment.updated_at) + interval '1 day'
      when appointment.coordination_state = 'invite_accepted'
        then appointment.updated_at + interval '2 days'
      when appointment.coordination_state = 'instruction_confirmed'
        then coalesce(appointment.instruction_confirmed_at, appointment.updated_at) + interval '1 day'
      when appointment.coordination_state = 'replacement_required'
        and replacement.appointment_id is not null then null
      when appointment.coordination_state = 'replacement_required'
        then appointment.updated_at + interval '1 day'
      else null
    end as action_due_at
  from public.transaction_legal_role_appointments appointment
  join public.transactions transaction on transaction.id = appointment.transaction_id
  left join public.transaction_partner_invitations invitation on invitation.id = appointment.invitation_id
  left join lateral (
    select newer.id as appointment_id
    from public.transaction_legal_role_appointments newer
    where newer.transaction_id = appointment.transaction_id
      and newer.role_type = appointment.role_type
      and newer.id <> appointment.id
      and newer.captured_at > appointment.captured_at
    order by newer.captured_at desc
    limit 1
  ) replacement on true
  left join lateral (
    select
      count(*) filter (
        where coalesce(item.assignment_status, item.status, 'pending') <> 'removed'
      )::integer as live_assignment_count,
      count(*) filter (
        where item.is_primary = true
          and coalesce(item.assignment_status, item.status, 'pending') <> 'removed'
          and coalesce(item.attorney_user_id, item.primary_attorney_id) is not null
      )::integer as primary_user_count,
      count(*) filter (
        where item.is_primary = true
          and coalesce(item.assignment_status, item.status, 'pending') <> 'removed'
          and item.instruction_status = 'accepted'
      )::integer as accepted_instruction_count,
      count(*) filter (
        where coalesce(item.assignment_status, item.status, 'pending') <> 'removed'
          and appointment.accepted_firm_id is not null
          and coalesce(item.attorney_firm_id, item.firm_id) is distinct from appointment.accepted_firm_id
      )::integer as mismatched_firm_count
    from public.transaction_attorney_assignments item
    where item.transaction_id = appointment.transaction_id
      and item.attorney_role = appointment.role_type
  ) assignment on true
  left join lateral (
    select
      count(*) filter (
        where coalesce(item.assignment_status, item.status, 'selected') not in ('removed', 'declined', 'rejected')
      )::integer as live_role_player_count,
      count(*) filter (
        where coalesce(item.assignment_status, item.status, '') = 'active'
          or item.status = 'active'
      )::integer as active_role_player_count,
      count(*) filter (
        where coalesce(item.assignment_status, item.status, 'selected') not in ('removed', 'declined', 'rejected')
          and appointment.accepted_organisation_id is not null
          and item.partner_organisation_id is distinct from appointment.accepted_organisation_id
      )::integer as mismatched_organisation_count
    from public.transaction_role_players item
    where item.transaction_id = appointment.transaction_id
      and item.role_type = appointment.role_type
  ) role_player on true
  where appointment.role_type in ('bond_attorney', 'cancellation_attorney')
), assessed as (
  select
    assurance_base.*,
    case
      when evidence_confirmed is not true then 'appointment_evidence_missing'
      when coordination_state in ('invite_sent', 'invite_accepted', 'instruction_confirmed', 'active')
        and invitation_id is null then 'invitation_link_missing'
      when coordination_state = 'invite_sent'
        and coalesce(invitation_status, '') not in ('pending', 'sent') then 'invitation_state_mismatch'
      when coordination_state in ('invite_accepted', 'instruction_confirmed', 'active')
        and (accepted_firm_id is null or accepted_organisation_id is null) then 'accepted_firm_binding_missing'
      when coordination_state in ('invite_accepted', 'instruction_confirmed', 'active')
        and invitation_status is distinct from 'accepted' then 'accepted_invitation_state_mismatch'
      when coordination_state = 'replacement_required' and superseded_by_appointment_id is not null then null
      when coordination_state = 'replacement_required'
        and (live_assignment_count > 0 or live_role_player_count > 0) then 'replacement_role_still_live'
      when mismatched_firm_count > 0 then 'assignment_outside_appointed_firm'
      when mismatched_organisation_count > 0 then 'role_player_outside_appointed_organisation'
      when staff_assignment_status = 'staff_assigned' and primary_user_count <> 1 then 'primary_attorney_assignment_mismatch'
      when staff_assignment_status <> 'staff_assigned' and primary_user_count > 0 then 'staff_status_not_synchronised'
      when coordination_state in ('instruction_confirmed', 'active')
        and (instruction_issuer is distinct from 'bank' or coalesce(trim(instruction_reference), '') = '')
        then 'bank_instruction_evidence_missing'
      when coordination_state = 'active' and accepted_instruction_count <> 1 then 'active_assignment_instruction_mismatch'
      when coordination_state = 'active' and active_role_player_count <> 1 then 'active_role_player_mismatch'
      else null
    end as assurance_issue
  from assurance_base
)
select
  id as appointment_id,
  transaction_id,
  organisation_id,
  role_type,
  appointing_bank,
  appointment_reference,
  appointed_firm_name,
  coordination_state,
  staff_assignment_status,
  invitation_id,
  invitation_status,
  superseded_by_appointment_id,
  accepted_organisation_id,
  accepted_firm_id,
  instruction_reference,
  instruction_source,
  instruction_issued_at,
  next_action_key,
  action_due_at,
  case
    when action_due_at is null or action_due_at >= now() then 0
    else greatest(0, floor(extract(epoch from (now() - action_due_at)) / 86400))::integer
  end as days_overdue,
  live_assignment_count,
  primary_user_count,
  accepted_instruction_count,
  live_role_player_count,
  active_role_player_count,
  assurance_issue,
  case
    when assurance_issue is not null then 'blocked'
    when action_due_at is not null and action_due_at < now() then 'attention'
    else 'on_track'
  end as assurance_health,
  updated_at as assurance_updated_at
from assessed;
grant select on public.legal_role_coordination_assurance_v1 to authenticated;
comment on view public.legal_role_coordination_assurance_v1 is
  'Phase 7 read-only assurance model for bank-appointed legal roles. Detects appointment, invitation, firm, staff, instruction, activation, and replacement drift without changing bank appointments.';
commit;
