begin;
alter table if exists public.transaction_legal_role_appointments
  add column if not exists instruction_issuer text,
  add column if not exists instruction_reference text,
  add column if not exists instruction_source text,
  add column if not exists instruction_evidence_document_id uuid,
  add column if not exists instruction_issued_at timestamptz,
  add column if not exists instruction_confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists instruction_confirmed_at timestamptz,
  add column if not exists instruction_decision_note text;
alter table if exists public.transaction_legal_role_appointments
  drop constraint if exists transaction_legal_role_appointments_instruction_issuer_check,
  drop constraint if exists transaction_legal_role_appointments_instruction_source_check;
alter table if exists public.transaction_legal_role_appointments
  add constraint transaction_legal_role_appointments_instruction_issuer_check
    check (instruction_issuer is null or instruction_issuer = 'bank'),
  add constraint transaction_legal_role_appointments_instruction_source_check
    check (
      instruction_source is null
      or instruction_source in ('bank_integration', 'instruction_document', 'appointed_firm_capture', 'legacy_manual')
    );
create or replace function public.bridge_user_can_decide_bank_legal_instruction(
  p_transaction_id uuid,
  p_role_type text,
  p_firm_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.attorney_user_is_firm_lead(p_firm_id)
    or exists (
      select 1
      from public.transaction_attorney_assignments assignment
      where assignment.transaction_id = p_transaction_id
        and assignment.attorney_role = p_role_type
        and coalesce(assignment.attorney_firm_id, assignment.firm_id) = p_firm_id
        and assignment.is_primary = true
        and coalesce(assignment.attorney_user_id, assignment.primary_attorney_id) = p_user_id
        and coalesce(assignment.assignment_status, assignment.status, 'pending') <> 'removed'
    );
$$;
create or replace function public.bridge_confirm_bank_legal_instruction(
  p_appointment_id uuid,
  p_instruction_reference text,
  p_instruction_source text default 'appointed_firm_capture',
  p_instruction_issued_at timestamptz default now(),
  p_evidence_document_id uuid default null,
  p_evidence_confirmed boolean default false
)
returns public.transaction_legal_role_appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_appointment public.transaction_legal_role_appointments%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if coalesce(trim(p_instruction_reference), '') = '' then
    raise exception 'Bank instruction reference is required.' using errcode = '22023';
  end if;
  if p_instruction_source not in ('bank_integration', 'instruction_document', 'appointed_firm_capture', 'legacy_manual') then
    raise exception 'Choose a valid bank instruction source.' using errcode = '22023';
  end if;
  if p_evidence_confirmed is not true then
    raise exception 'Confirm that the formal instruction was issued by the appointing bank.' using errcode = '22023';
  end if;

  select appointment.*
  into v_appointment
  from public.transaction_legal_role_appointments appointment
  where appointment.id = p_appointment_id
    and appointment.role_type in ('bond_attorney', 'cancellation_attorney')
  for update;

  if v_appointment.id is null then
    raise exception 'Bank-appointed legal role was not found.' using errcode = 'P0002';
  end if;
  if v_appointment.coordination_state in ('instruction_confirmed', 'active') then
    return v_appointment;
  end if;
  if v_appointment.coordination_state <> 'invite_accepted' or v_appointment.accepted_firm_id is null then
    raise exception 'The appointed firm must accept its platform invitation before bank instruction can be recorded.' using errcode = '42501';
  end if;
  if not public.bridge_user_can_decide_bank_legal_instruction(
    v_appointment.transaction_id,
    v_appointment.role_type,
    v_appointment.accepted_firm_id,
    v_actor_id
  ) then
    raise exception 'Only a manager or assigned primary attorney of the appointed firm may record this bank instruction.' using errcode = '42501';
  end if;

  update public.transaction_legal_role_appointments
  set
    instruction_issuer = 'bank',
    instruction_reference = trim(p_instruction_reference),
    instruction_source = p_instruction_source,
    instruction_evidence_document_id = p_evidence_document_id,
    instruction_issued_at = coalesce(p_instruction_issued_at, now()),
    instruction_confirmed_by = v_actor_id,
    instruction_confirmed_at = now(),
    coordination_state = 'instruction_confirmed'
  where id = v_appointment.id
  returning * into v_appointment;

  update public.transaction_attorney_assignments assignment
  set
    instruction_status = 'ready_for_acceptance',
    updated_at = now()
  where assignment.transaction_id = v_appointment.transaction_id
    and assignment.attorney_role = v_appointment.role_type
    and coalesce(assignment.attorney_firm_id, assignment.firm_id) = v_appointment.accepted_firm_id
    and assignment.is_primary = true
    and coalesce(assignment.assignment_status, assignment.status, 'pending') <> 'removed';

  perform public.bridge_log_transaction_partner_invitation_event(
    v_appointment.transaction_id,
    'Legal Role Instruction Confirmed',
    v_actor_id,
    jsonb_build_object(
      'appointmentId', v_appointment.id,
      'roleType', v_appointment.role_type,
      'instructionIssuer', 'bank',
      'instructionReference', v_appointment.instruction_reference,
      'instructionSource', v_appointment.instruction_source,
      'eventName', 'legal_role_instruction_confirmed'
    )
  );

  return v_appointment;
end;
$$;
-- Phase 4 prevents casual removal of an appointed firm. Phase 5 permits removal
-- only after the instruction decision has explicitly entered replacement_required.
create or replace function public.bridge_enforce_appointed_firm_staff_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.transaction_legal_role_appointments%rowtype;
begin
  if new.attorney_role not in ('bond_attorney', 'cancellation_attorney') then
    return new;
  end if;

  select appointment.*
  into v_appointment
  from public.transaction_legal_role_appointments appointment
  where appointment.transaction_id = new.transaction_id
    and appointment.role_type = new.attorney_role
  order by appointment.updated_at desc
  limit 1;

  if new.assignment_status = 'removed' and v_appointment.coordination_state = 'replacement_required' then
    return new;
  end if;
  if new.assignment_status = 'removed' then
    raise exception 'A bank-appointed firm cannot be removed through staff assignment. Start the appointment replacement workflow instead.' using errcode = '42501';
  end if;
  if v_appointment.id is null
    or v_appointment.accepted_firm_id is null
    or v_appointment.coordination_state not in ('invite_accepted', 'instruction_confirmed', 'active') then
    raise exception 'The bank-appointed firm must accept its invitation before staff can be assigned.' using errcode = '42501';
  end if;
  if coalesce(new.attorney_firm_id, new.firm_id) is distinct from v_appointment.accepted_firm_id then
    raise exception 'Bond and cancellation staff must be assigned from the bank-appointed firm.' using errcode = '42501';
  end if;

  return new;
end;
$$;
create or replace function public.bridge_decide_bank_legal_instruction(
  p_appointment_id uuid,
  p_decision text,
  p_note text default null
)
returns public.transaction_legal_role_appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_appointment public.transaction_legal_role_appointments%rowtype;
  v_primary_assignment public.transaction_attorney_assignments%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if v_decision not in ('accepted', 'declined') then
    raise exception 'Instruction decision must be accepted or declined.' using errcode = '22023';
  end if;
  if v_decision = 'declined' and coalesce(trim(p_note), '') = '' then
    raise exception 'A reason is required when declining a bank instruction.' using errcode = '22023';
  end if;

  select appointment.*
  into v_appointment
  from public.transaction_legal_role_appointments appointment
  where appointment.id = p_appointment_id
    and appointment.role_type in ('bond_attorney', 'cancellation_attorney')
  for update;

  if v_appointment.id is null then
    raise exception 'Bank-appointed legal role was not found.' using errcode = 'P0002';
  end if;
  if v_decision = 'accepted' and v_appointment.coordination_state = 'active' then
    return v_appointment;
  end if;
  if v_decision = 'declined' and v_appointment.coordination_state = 'replacement_required' then
    return v_appointment;
  end if;
  if v_appointment.coordination_state <> 'instruction_confirmed' then
    raise exception 'The bank instruction must be confirmed before the appointed firm records its decision.' using errcode = '42501';
  end if;
  if not public.bridge_user_can_decide_bank_legal_instruction(
    v_appointment.transaction_id,
    v_appointment.role_type,
    v_appointment.accepted_firm_id,
    v_actor_id
  ) then
    raise exception 'Only a manager or assigned primary attorney of the appointed firm may decide this instruction.' using errcode = '42501';
  end if;

  select assignment.*
  into v_primary_assignment
  from public.transaction_attorney_assignments assignment
  where assignment.transaction_id = v_appointment.transaction_id
    and assignment.attorney_role = v_appointment.role_type
    and coalesce(assignment.attorney_firm_id, assignment.firm_id) = v_appointment.accepted_firm_id
    and assignment.is_primary = true
    and coalesce(assignment.assignment_status, assignment.status, 'pending') <> 'removed'
  order by assignment.updated_at desc
  limit 1
  for update;

  if v_decision = 'accepted' and (
    v_appointment.staff_assignment_status <> 'staff_assigned'
    or v_primary_assignment.id is null
    or coalesce(v_primary_assignment.attorney_user_id, v_primary_assignment.primary_attorney_id) is null
  ) then
    raise exception 'Assign a primary attorney from the appointed firm before activating this legal role.' using errcode = '42501';
  end if;

  if v_decision = 'accepted' then
    update public.transaction_legal_role_appointments
    set
      coordination_state = 'active',
      instruction_decision_note = nullif(trim(coalesce(p_note, '')), '')
    where id = v_appointment.id
    returning * into v_appointment;

    update public.transaction_attorney_assignments assignment
    set
      instruction_status = 'accepted',
      instruction_accepted_at = now(),
      instruction_accepted_by = v_actor_id,
      instruction_decision_note = nullif(trim(coalesce(p_note, '')), ''),
      status = 'active',
      assignment_status = 'active',
      updated_at = now()
    where assignment.id = v_primary_assignment.id;

    update public.transaction_role_players role_player
    set
      status = 'active',
      assignment_status = 'active',
      activation_trigger = 'bank_instruction_accepted',
      activated_at = now(),
      updated_at = now()
    where role_player.transaction_id = v_appointment.transaction_id
      and role_player.role_type = v_appointment.role_type
      and role_player.partner_organisation_id = v_appointment.accepted_organisation_id;
  else
    update public.transaction_legal_role_appointments
    set
      coordination_state = 'replacement_required',
      instruction_decision_note = nullif(trim(coalesce(p_note, '')), '')
    where id = v_appointment.id
    returning * into v_appointment;

    update public.transaction_attorney_assignments assignment
    set
      instruction_status = 'declined',
      instruction_declined_at = now(),
      instruction_declined_by = v_actor_id,
      instruction_decision_note = nullif(trim(coalesce(p_note, '')), ''),
      status = 'removed',
      assignment_status = 'removed',
      updated_at = now()
    where assignment.id = v_primary_assignment.id;

    update public.transaction_role_players role_player
    set
      status = 'removed',
      assignment_status = 'removed',
      removed_at = now(),
      updated_at = now()
    where role_player.transaction_id = v_appointment.transaction_id
      and role_player.role_type = v_appointment.role_type
      and role_player.partner_organisation_id = v_appointment.accepted_organisation_id;
  end if;

  perform public.bridge_log_transaction_partner_invitation_event(
    v_appointment.transaction_id,
    case when v_decision = 'accepted' then 'Legal Role Activated' else 'Legal Role Replacement Required' end,
    v_actor_id,
    jsonb_build_object(
      'appointmentId', v_appointment.id,
      'roleType', v_appointment.role_type,
      'decision', v_decision,
      'eventName', case
        when v_decision = 'accepted' then 'legal_role_activated'
        else 'legal_role_replacement_required'
      end
    )
  );

  return v_appointment;
end;
$$;
revoke all on function public.bridge_user_can_decide_bank_legal_instruction(uuid, text, uuid, uuid) from public;
revoke all on function public.bridge_confirm_bank_legal_instruction(uuid, text, text, timestamptz, uuid, boolean) from public;
revoke all on function public.bridge_decide_bank_legal_instruction(uuid, text, text) from public;
grant execute on function public.bridge_confirm_bank_legal_instruction(uuid, text, text, timestamptz, uuid, boolean) to authenticated;
grant execute on function public.bridge_decide_bank_legal_instruction(uuid, text, text) to authenticated;
commit;
