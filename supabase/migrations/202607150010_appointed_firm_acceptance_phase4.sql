begin;
alter table if exists public.transaction_legal_role_appointments
  add column if not exists accepted_organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists accepted_firm_id uuid references public.attorney_firms(id) on delete set null,
  add column if not exists accepted_by uuid references auth.users(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists staff_assignment_status text not null default 'awaiting_firm_acceptance';
alter table if exists public.transaction_legal_role_appointments
  drop constraint if exists transaction_legal_role_appointments_staff_status_check;
alter table if exists public.transaction_legal_role_appointments
  add constraint transaction_legal_role_appointments_staff_status_check
  check (staff_assignment_status in ('awaiting_firm_acceptance', 'awaiting_staff_assignment', 'staff_assigned'));
create or replace function public.bridge_bind_bank_appointed_firm_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment_id uuid;
  v_firm_id uuid;
  v_assignment_id uuid;
  v_assignment_type text;
begin
  if new.role_type not in ('bond_attorney', 'cancellation_attorney') or new.status <> 'accepted' then
    return new;
  end if;

  v_appointment_id := nullif(new.metadata ->> 'legal_role_appointment_id', '')::uuid;
  if v_appointment_id is null or new.organisation_id is null then
    raise exception 'The appointed firm organisation is required to accept this legal role.' using errcode = '42501';
  end if;

  select firm.id
  into v_firm_id
  from public.attorney_firms firm
  where firm.organisation_id = new.organisation_id
    and coalesce(firm.is_active, true) = true
  order by firm.updated_at desc nulls last
  limit 1;

  if v_firm_id is null then
    raise exception 'The accepting organisation must be linked to an active attorney firm.' using errcode = '42501';
  end if;

  update public.transaction_legal_role_appointments appointment
  set
    accepted_organisation_id = new.organisation_id,
    accepted_firm_id = v_firm_id,
    accepted_by = new.accepted_user_id,
    accepted_at = coalesce(new.accepted_at, now()),
    coordination_state = 'invite_accepted',
    staff_assignment_status = 'awaiting_staff_assignment'
  where appointment.id = v_appointment_id
    and appointment.transaction_id = new.transaction_id
    and appointment.role_type = new.role_type
    and appointment.evidence_confirmed = true;

  if not found then
    raise exception 'The bank appointment could not be matched to this invitation.' using errcode = '42501';
  end if;

  -- Invitation acceptance grants the firm the transaction role. The accepting
  -- user remains an access holder, but is not automatically the matter attorney.
  update public.transaction_participants participant
  set
    user_id = null,
    partner_organisation_id = new.organisation_id,
    participant_name = new.company_name,
    status = 'active',
    assignment_source = 'appointed_firm_invitation',
    updated_at = now()
  where participant.transaction_partner_invitation_id = new.id;

  update public.transaction_role_players role_player
  set
    user_id = null,
    assigned_user_id = null,
    partner_organisation_id = new.organisation_id,
    status = 'selected',
    assignment_status = 'selected',
    activation_trigger = 'appointed_firm_staff_assignment',
    activated_at = null,
    updated_at = now()
  where role_player.transaction_id = new.transaction_id
    and role_player.role_type = new.role_type
    and (
      role_player.transaction_partner_invitation_id = new.id
      or lower(coalesce(role_player.email_address, '')) = lower(new.email)
    );

  v_assignment_type := case when new.role_type = 'bond_attorney' then 'bond' else 'cancellation' end;

  select assignment.id
  into v_assignment_id
  from public.transaction_attorney_assignments assignment
  where assignment.transaction_id = new.transaction_id
    and assignment.attorney_role = new.role_type
    and coalesce(assignment.assignment_status, assignment.status, 'pending') <> 'removed'
  order by assignment.is_primary desc, assignment.updated_at desc nulls last
  limit 1;

  if v_assignment_id is null then
    insert into public.transaction_attorney_assignments (
      transaction_id,
      firm_id,
      attorney_firm_id,
      assignment_type,
      attorney_role,
      status,
      assignment_status,
      instruction_status,
      is_primary,
      visibility_scope,
      can_edit,
      can_manage_documents,
      can_manage_signing,
      can_add_internal_notes,
      can_add_shared_updates,
      can_update_workflow_lane,
      assigned_by,
      assigned_at
    )
    values (
      new.transaction_id,
      v_firm_id,
      v_firm_id,
      v_assignment_type,
      new.role_type,
      'pending',
      'pending',
      'new_instruction',
      true,
      'firm_matter',
      true,
      true,
      true,
      true,
      true,
      true,
      new.accepted_user_id,
      now()
    );
  else
    update public.transaction_attorney_assignments
    set
      firm_id = v_firm_id,
      attorney_firm_id = v_firm_id,
      assignment_type = v_assignment_type,
      attorney_role = new.role_type,
      primary_attorney_id = null,
      attorney_user_id = null,
      secretary_id = null,
      admin_handler_id = null,
      status = 'pending',
      assignment_status = 'pending',
      instruction_status = 'new_instruction',
      is_primary = true,
      visibility_scope = 'firm_matter',
      assigned_by = new.accepted_user_id,
      assigned_at = now(),
      updated_at = now()
    where id = v_assignment_id;
  end if;

  perform public.bridge_log_transaction_partner_invitation_event(
    new.transaction_id,
    'Legal Role Firm Accepted',
    new.accepted_user_id,
    jsonb_build_object(
      'invitationId', new.id,
      'appointmentId', v_appointment_id,
      'roleType', new.role_type,
      'partnerOrganisationId', new.organisation_id,
      'attorneyFirmId', v_firm_id,
      'staffAssignmentStatus', 'awaiting_staff_assignment',
      'legalInstructionConfirmed', false
    )
  );

  return new;
end;
$$;
drop trigger if exists bind_bank_appointed_firm_acceptance on public.transaction_partner_invitations;
create trigger bind_bank_appointed_firm_acceptance
after update of status on public.transaction_partner_invitations
for each row
when (old.status is distinct from new.status)
execute function public.bridge_bind_bank_appointed_firm_acceptance();
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

  if new.assignment_status = 'removed' then
    raise exception 'A bank-appointed firm cannot be removed through staff assignment. Start the appointment replacement workflow instead.' using errcode = '42501';
  end if;

  select appointment.*
  into v_appointment
  from public.transaction_legal_role_appointments appointment
  where appointment.transaction_id = new.transaction_id
    and appointment.role_type = new.attorney_role
    and appointment.coordination_state in ('invite_accepted', 'instruction_confirmed', 'active')
  order by appointment.updated_at desc
  limit 1;

  if v_appointment.id is null or v_appointment.accepted_firm_id is null then
    raise exception 'The bank-appointed firm must accept its invitation before staff can be assigned.' using errcode = '42501';
  end if;

  if coalesce(new.attorney_firm_id, new.firm_id) is distinct from v_appointment.accepted_firm_id then
    raise exception 'Bond and cancellation staff must be assigned from the bank-appointed firm.' using errcode = '42501';
  end if;

  return new;
end;
$$;
drop trigger if exists enforce_appointed_firm_staff_assignment on public.transaction_attorney_assignments;
create trigger enforce_appointed_firm_staff_assignment
before insert or update
on public.transaction_attorney_assignments
for each row execute function public.bridge_enforce_appointed_firm_staff_assignment();
create or replace function public.bridge_sync_appointed_firm_staff_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assigned_user_id uuid;
begin
  if new.attorney_role not in ('bond_attorney', 'cancellation_attorney') then
    return new;
  end if;

  v_assigned_user_id := coalesce(new.attorney_user_id, new.primary_attorney_id);
  if new.assignment_status = 'removed' or v_assigned_user_id is null then
    return new;
  end if;

  update public.transaction_legal_role_appointments appointment
  set staff_assignment_status = 'staff_assigned'
  where appointment.transaction_id = new.transaction_id
    and appointment.role_type = new.attorney_role
    and appointment.accepted_firm_id = coalesce(new.attorney_firm_id, new.firm_id)
    and appointment.coordination_state in ('invite_accepted', 'instruction_confirmed', 'active');

  update public.transaction_role_players role_player
  set
    user_id = v_assigned_user_id,
    assigned_user_id = v_assigned_user_id,
    status = case when role_player.status = 'active' then 'active' else 'selected' end,
    assignment_status = case when role_player.assignment_status = 'active' then 'active' else 'selected' end,
    activation_trigger = case
      when role_player.status = 'active' then role_player.activation_trigger
      else 'bank_instruction_confirmed'
    end,
    activated_at = case when role_player.status = 'active' then role_player.activated_at else null end,
    updated_at = now()
  where role_player.transaction_id = new.transaction_id
    and role_player.role_type = new.attorney_role
    and role_player.partner_organisation_id = (
      select appointment.accepted_organisation_id
      from public.transaction_legal_role_appointments appointment
      where appointment.transaction_id = new.transaction_id
        and appointment.role_type = new.attorney_role
      order by appointment.updated_at desc
      limit 1
    );

  return new;
end;
$$;
drop trigger if exists sync_appointed_firm_staff_assignment on public.transaction_attorney_assignments;
create trigger sync_appointed_firm_staff_assignment
after insert or update of attorney_user_id, primary_attorney_id, assignment_status
on public.transaction_attorney_assignments
for each row execute function public.bridge_sync_appointed_firm_staff_assignment();
commit;
