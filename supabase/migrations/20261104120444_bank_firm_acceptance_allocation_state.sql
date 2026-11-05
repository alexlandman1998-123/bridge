-- Firm invitation acceptance must enter the current allocation lifecycle.
-- It grants firm access, but never appoints a person or accepts bank instruction.
create or replace function handoff_private.reconcile_bank_firm_allocation(p_invitation uuid)
returns void language plpgsql security invoker set search_path='' as $function$
begin
 update public.transaction_attorney_assignments a set
   appointment_source='bank_appointed',firm_acceptance_status='accepted',
   firm_accepted_at=coalesce(i.accepted_at,p.accepted_at,now()),firm_accepted_by=i.accepted_user_id,
   staff_assignment_status='awaiting_staff_assignment',allocation_state='awaiting_staff_assignment',allocation_state_changed_at=now(),
   assigned_organisation_id=p.accepted_organisation_id,scope_level='organisation'
 from public.transaction_partner_invitations i
 join public.transaction_legal_role_appointments p on p.id=nullif(i.metadata->>'legal_role_appointment_id','')::uuid
 join public.transactions t on t.id=i.transaction_id
 where i.id=p_invitation and i.status='accepted' and i.role_type in ('bond_attorney','cancellation_attorney')
   and p.transaction_id=i.transaction_id and p.role_type=i.role_type and p.evidence_confirmed
   and p.accepted_organisation_id=i.organisation_id and p.accepted_firm_id is not null
   and p.coordination_state in ('invite_accepted','instruction_confirmed','active')
   and a.transaction_id=t.id and a.attorney_role=i.role_type
   and coalesce(a.attorney_firm_id,a.firm_id)=p.accepted_firm_id
   and a.attorney_user_id is null and a.primary_attorney_id is null
   and a.assignment_status='pending' and a.instruction_status in ('new_instruction','ready_for_acceptance')
   and a.firm_acceptance_status in ('not_required','awaiting_firm_acceptance')
   and a.allocation_state in ('active','awaiting_firm_acceptance')
   and t.registered_at is null and t.cancelled_at is null and t.archived_at is null
   and coalesce(t.lifecycle_state,'active') not in ('registered','completed','cancelled','archived');
end $function$;
revoke all on function handoff_private.reconcile_bank_firm_allocation(uuid) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.bridge_bind_bank_appointed_firm_acceptance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  perform handoff_private.reconcile_bank_firm_allocation(new.id);

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
$function$
;
CREATE OR REPLACE FUNCTION public.bridge_repair_transaction_partner_invitation_acceptance(p_invitation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_invite public.transaction_partner_invitations%rowtype;
  v_tx public.transactions%rowtype;
  v_now timestamptz := now();
  v_email text;
  v_owner_organisation_id uuid;
  v_accepting_organisation_id uuid;
  v_active_workspace_count integer;
  v_shape record;
  v_existing_relationship public.organisation_partners%rowtype;
  v_partner_relationship_id uuid;
  v_partner_type text;
  v_access_id uuid;
  v_participant_id uuid;
  v_role_player_count integer := 0;
begin
  select *
  into v_invite
  from public.transaction_partner_invitations
  where id = p_invitation_id
  for update;

  if v_invite.id is null then
    return jsonb_build_object('success', false, 'code', 'invitation_not_found');
  end if;

  if v_invite.status in ('expired', 'declined') then
    return jsonb_build_object('success', false, 'code', 'reinvite_required', 'status', v_invite.status);
  end if;

  if v_invite.status <> 'accepted' then
    return jsonb_build_object('success', false, 'code', 'resume_acceptance_required', 'status', v_invite.status);
  end if;

  if v_invite.accepted_user_id is null then
    return jsonb_build_object('success', false, 'code', 'accepted_user_missing');
  end if;

  select *
  into v_tx
  from public.transactions
  where id = v_invite.transaction_id
  limit 1;

  if v_tx.id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_not_found');
  end if;

  v_owner_organisation_id := v_tx.organisation_id;
  if v_owner_organisation_id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_owner_missing');
  end if;

  v_accepting_organisation_id := v_invite.organisation_id;
  v_email := lower(coalesce(v_invite.email, ''));

  if v_accepting_organisation_id is null then
    select count(distinct ou.organisation_id), min(ou.organisation_id)
    into v_active_workspace_count, v_accepting_organisation_id
    from public.organisation_users ou
    where ou.user_id = v_invite.accepted_user_id
      and ou.organisation_id is not null
      and ou.organisation_id <> v_owner_organisation_id
      and coalesce(ou.membership_status, ou.status, 'pending') = 'active';

    if coalesce(v_active_workspace_count, 0) <> 1 then
      return jsonb_build_object(
        'success', false,
        'code', 'ambiguous_accepting_organisation',
        'activeWorkspaceCount', coalesce(v_active_workspace_count, 0)
      );
    end if;
  elsif v_accepting_organisation_id = v_owner_organisation_id then
    return jsonb_build_object('success', false, 'code', 'self_relationship');
  elsif not exists (
    select 1
    from public.organisation_users ou
    where ou.user_id = v_invite.accepted_user_id
      and ou.organisation_id = v_accepting_organisation_id
      and coalesce(ou.membership_status, ou.status, 'pending') = 'active'
  ) then
    return jsonb_build_object('success', false, 'code', 'not_active_member');
  end if;

  select *
  into v_shape
  from public.bridge_transaction_partner_invite_role_shape(v_invite.role_type)
  limit 1;

  v_partner_type := case
    when v_invite.role_type in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney') then 'attorney_firm'
    when v_invite.role_type = 'bond_originator' then 'bond_originator'
    when v_invite.role_type = 'developer' then 'developer_company'
    else 'other'
  end;

  select *
  into v_existing_relationship
  from public.organisation_partners relationship
  where (
      relationship.organisation_id = v_owner_organisation_id
      and relationship.partner_organisation_id = v_accepting_organisation_id
    )
    or (
      relationship.organisation_id = v_accepting_organisation_id
      and relationship.partner_organisation_id = v_owner_organisation_id
    )
  order by relationship.created_at asc nulls last
  limit 1
  for update;

  if v_existing_relationship.id is not null then
    update public.organisation_partners
    set relationship_status = 'accepted',
        status = 'accepted',
        relationship_type = coalesce(nullif(relationship_type, ''), 'approved'),
        visibility_level = case
          when coalesce(preferred, false) then 'preferred_partners'
          else coalesce(nullif(visibility_level, ''), 'connected_partners')
        end,
        partner_type = coalesce(nullif(partner_type, ''), v_partner_type),
        scope_type = coalesce(nullif(scope_type, ''), 'organisation'),
        scope_id = coalesce(scope_id, v_owner_organisation_id),
        accepted_at = coalesce(accepted_at, v_now),
        updated_at = v_now
    where id = v_existing_relationship.id
    returning id into v_partner_relationship_id;
  else
    insert into public.organisation_partners (
      organisation_id,
      partner_organisation_id,
      relationship_status,
      status,
      relationship_type,
      visibility_level,
      partner_type,
      scope_type,
      scope_id,
      preferred,
      accepted_at,
      created_by
    )
    values (
      v_owner_organisation_id,
      v_accepting_organisation_id,
      'accepted',
      'accepted',
      'approved',
      'connected_partners',
      v_partner_type,
      'organisation',
      v_owner_organisation_id,
      false,
      v_now,
      v_invite.accepted_user_id
    )
    returning id into v_partner_relationship_id;
  end if;

  insert into public.transaction_user_access (
    transaction_id,
    user_id,
    access_role,
    created_by_invitation_id
  )
  values (
    v_invite.transaction_id,
    v_invite.accepted_user_id,
    v_invite.role_type,
    v_invite.id
  )
  on conflict (transaction_id, user_id, access_role) do update
  set created_by_invitation_id = excluded.created_by_invitation_id,
      updated_at = v_now
  returning id into v_access_id;

  update public.transaction_participants participant
  set user_id = v_invite.accepted_user_id,
      role_type = v_shape.role_type,
      legal_role = v_shape.legal_role,
      transaction_role = v_shape.transaction_role,
      status = 'active',
      participant_name = coalesce(participant.participant_name, v_invite.contact_name, v_invite.company_name),
      participant_email = coalesce(nullif(participant.participant_email, ''), v_email),
      accepted_at = coalesce(participant.accepted_at, v_now),
      visibility_scope = 'shared',
      is_internal = false,
      participant_scope = 'transaction',
      assignment_source = 'partner_invitation',
      transaction_partner_invitation_id = v_invite.id,
      partner_organisation_id = v_accepting_organisation_id,
      can_view = true,
      can_comment = true,
      can_upload_documents = true,
      can_edit_finance_workflow = v_invite.role_type = 'bond_originator',
      can_edit_attorney_workflow = v_invite.role_type in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney'),
      can_edit_core_transaction = false,
      updated_at = v_now
  where participant.id = (
    select candidate.id
    from public.transaction_participants candidate
    where candidate.transaction_id = v_invite.transaction_id
      and candidate.removed_at is null
      and (
        candidate.transaction_partner_invitation_id = v_invite.id
        or candidate.user_id = v_invite.accepted_user_id
        or lower(coalesce(candidate.participant_email, '')) = v_email
      )
    order by
      case when candidate.transaction_partner_invitation_id = v_invite.id then 0 else 1 end,
      candidate.updated_at desc nulls last,
      candidate.created_at desc nulls last
    limit 1
  )
  returning id into v_participant_id;

  if v_participant_id is null then
    insert into public.transaction_participants (
      transaction_id,
      user_id,
      role_type,
      legal_role,
      transaction_role,
      status,
      participant_name,
      participant_email,
      invited_by_user_id,
      invited_at,
      accepted_at,
      visibility_scope,
      is_internal,
      participant_scope,
      assignment_source,
      transaction_partner_invitation_id,
      partner_organisation_id,
      can_view,
      can_comment,
      can_upload_documents,
      can_edit_finance_workflow,
      can_edit_attorney_workflow,
      can_edit_core_transaction
    )
    values (
      v_invite.transaction_id,
      v_invite.accepted_user_id,
      v_shape.role_type,
      v_shape.legal_role,
      v_shape.transaction_role,
      'active',
      coalesce(v_invite.contact_name, v_invite.company_name),
      v_email,
      v_invite.invited_by_user_id,
      coalesce(v_invite.created_at, v_now),
      v_now,
      'shared',
      false,
      'transaction',
      'partner_invitation',
      v_invite.id,
      v_accepting_organisation_id,
      true,
      true,
      true,
      v_invite.role_type = 'bond_originator',
      v_invite.role_type in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney'),
      false
    )
    on conflict (transaction_id, role_type, legal_role) where coalesce(transaction_role,'') <> 'buyer' do update
    set user_id = excluded.user_id,
        status = 'active',
        participant_name = excluded.participant_name,
        participant_email = excluded.participant_email,
        accepted_at = excluded.accepted_at,
        transaction_role = excluded.transaction_role,
        transaction_partner_invitation_id = excluded.transaction_partner_invitation_id,
        partner_organisation_id = excluded.partner_organisation_id,
        assignment_source = excluded.assignment_source,
        updated_at = v_now
    where public.transaction_participants.transaction_partner_invitation_id is null
       or public.transaction_participants.transaction_partner_invitation_id = v_invite.id
       or lower(coalesce(public.transaction_participants.participant_email, '')) = v_email
    returning id into v_participant_id;
  end if;

  perform handoff_private.ensure_invitation_partner_role(v_invite.id,v_partner_relationship_id);

  update public.transaction_role_players role_player
  set user_id = v_invite.accepted_user_id,
      assigned_user_id = v_invite.accepted_user_id,
      contact_person = coalesce(role_player.contact_person, v_invite.contact_name),
      partner_name = coalesce(role_player.partner_name, v_invite.company_name),
      email_address = coalesce(nullif(role_player.email_address, ''), v_email),
      phone_number = coalesce(nullif(role_player.phone_number, ''), v_invite.phone),
      status = 'active',
      assignment_status = 'active',
      activation_trigger = 'invitation_reconciled',
      activated_at = coalesce(role_player.activated_at, v_now),
      transaction_partner_invitation_id = v_invite.id,
      partner_organisation_id = v_accepting_organisation_id,
      partner_relationship_id = v_partner_relationship_id,
      updated_at = v_now
  where role_player.transaction_id = v_invite.transaction_id
    and role_player.role_type = v_shape.transaction_role
    and role_player.removed_at is null
    and (
      role_player.transaction_partner_invitation_id = v_invite.id
      or role_player.user_id = v_invite.accepted_user_id
      or lower(coalesce(role_player.email_address, '')) = v_email
    );

  get diagnostics v_role_player_count = row_count;

  if v_role_player_count = 0 then
    insert into public.transaction_role_players (
      transaction_id,
      role_type,
      selection_source,
      partner_name,
      contact_person,
      email_address,
      phone_number,
      status,
      assignment_status,
      user_id,
      assigned_user_id,
      activation_trigger,
      activated_at,
      transaction_partner_invitation_id,
      partner_organisation_id,
      partner_relationship_id,
      snapshot_json
    )
    values (
      v_invite.transaction_id,
      v_shape.transaction_role,
      'invited_partner',
      v_invite.company_name,
      v_invite.contact_name,
      v_email,
      v_invite.phone,
      'active',
      'active',
      v_invite.accepted_user_id,
      v_invite.accepted_user_id,
      'invitation_reconciled',
      v_now,
      v_invite.id,
      v_accepting_organisation_id,
      v_partner_relationship_id,
      jsonb_build_object('source', 'invite_acceptance_reconciliation_phase5')
    );
  end if;

  update public.transaction_partner_invitations
  set organisation_id = v_accepting_organisation_id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'acceptedTransactionUserAccessId', v_access_id,
        'acceptedTransactionParticipantId', v_participant_id,
        'acceptedPartnerRelationshipId', v_partner_relationship_id,
        'acceptedPartnerOrganisationId', v_accepting_organisation_id,
        'acceptedOwnerOrganisationId', v_owner_organisation_id,
        'phase5ReconciledAt', v_now
      ),
      updated_at = v_now
  where id = v_invite.id;

  perform handoff_private.reconcile_bank_firm_allocation(v_invite.id);

  return jsonb_build_object(
    'success', true,
    'invitationId', v_invite.id,
    'transactionId', v_invite.transaction_id,
    'partnerRelationshipId', v_partner_relationship_id,
    'partnerOrganisationId', v_accepting_organisation_id,
    'ownerOrganisationId', v_owner_organisation_id,
    'transactionUserAccessId', v_access_id,
    'transactionParticipantId', v_participant_id,
    'repairedWithoutReinvite', true
  );
end;
$function$;
notify pgrst,'reload schema';
