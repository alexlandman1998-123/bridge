-- Match the live partial non-buyer identity index during invitation acceptance and reconciliation.
CREATE OR REPLACE FUNCTION handoff_private.accept_transaction_partner_invitation_legacy(p_token text, p_profile jsonb DEFAULT '{}'::jsonb, p_organisation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token uuid;
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_now timestamptz := now();
  v_invite public.transaction_partner_invitations%rowtype;
  v_tx public.transactions%rowtype;
  v_owner_organisation_id uuid;
  v_accepting_organisation_id uuid := p_organisation_id;
  v_membership public.organisation_users%rowtype;
  v_shape record;
  v_profile_role text;
  v_first_name text;
  v_last_name text;
  v_full_name text;
  v_phone text;
  v_access_id uuid;
  v_participant_id uuid;
  v_partner_relationship_id uuid;
  v_partner_type text;
  v_existing_relationship public.organisation_partners%rowtype;
  v_access_confirmed boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated');
  end if;

  begin
    v_token := nullif(trim(p_token), '')::uuid;
  exception
    when invalid_text_representation then
      return jsonb_build_object('success', false, 'code', 'invalid_token');
  end;

  select *
  into v_invite
  from public.transaction_partner_invitations
  where invitation_token = v_token
  for update;

  if v_invite.id is null then
    return jsonb_build_object('success', false, 'code', 'invitation_not_found');
  end if;

  if v_invite.status <> 'pending' then
    return jsonb_build_object('success', false, 'code', 'invitation_' || v_invite.status);
  end if;

  if v_invite.expires_at < v_now then
    update public.transaction_partner_invitations
    set status = 'expired', invitation_token = null
    where id = v_invite.id;
    return jsonb_build_object('success', false, 'code', 'invitation_expired');
  end if;

  if v_invite.email is not null and v_email <> '' and lower(v_invite.email) <> v_email then
    return jsonb_build_object(
      'success', false,
      'code', 'email_mismatch',
      'expectedEmail', lower(v_invite.email),
      'actualEmail', v_email
    );
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

  if v_invite.organisation_id is not null and p_organisation_id is not null and v_invite.organisation_id <> p_organisation_id then
    return jsonb_build_object('success', false, 'code', 'wrong_workspace');
  end if;

  v_accepting_organisation_id := coalesce(v_accepting_organisation_id, v_invite.organisation_id);
  if v_accepting_organisation_id is null then
    return jsonb_build_object('success', false, 'code', 'organisation_required');
  end if;

  if v_accepting_organisation_id = v_owner_organisation_id then
    return jsonb_build_object('success', false, 'code', 'self_relationship');
  end if;

  select *
  into v_membership
  from public.organisation_users
  where organisation_id = v_accepting_organisation_id
    and user_id = v_user_id
    and coalesce(membership_status, status, 'pending') = 'active'
  limit 1;

  if v_membership.id is null then
    return jsonb_build_object('success', false, 'code', 'not_active_member');
  end if;

  select *
  into v_shape
  from public.bridge_transaction_partner_invite_role_shape(v_invite.role_type)
  limit 1;

  v_profile_role := coalesce(nullif(p_profile ->> 'role', ''), v_shape.profile_role);
  if v_profile_role not in ('viewer', 'agent', 'developer', 'attorney', 'bond_originator', 'client') then
    v_profile_role := v_shape.profile_role;
  end if;

  v_partner_type := case
    when v_invite.role_type in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney') then 'attorney_firm'
    when v_invite.role_type = 'bond_originator' then 'bond_originator'
    when v_invite.role_type = 'developer' then 'developer_company'
    else 'other'
  end;

  v_first_name := nullif(trim(coalesce(p_profile ->> 'firstName', p_profile ->> 'first_name', '')), '');
  v_last_name := nullif(trim(coalesce(p_profile ->> 'lastName', p_profile ->> 'last_name', '')), '');
  v_full_name := nullif(trim(coalesce(p_profile ->> 'fullName', p_profile ->> 'full_name', concat_ws(' ', v_first_name, v_last_name), v_invite.contact_name)), '');
  v_phone := nullif(trim(coalesce(p_profile ->> 'mobileNumber', p_profile ->> 'mobile_number', p_profile ->> 'phone', v_invite.phone)), '');

  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    full_name,
    company_name,
    phone_number,
    role,
    onboarding_completed
  )
  values (
    v_user_id,
    coalesce(nullif(v_email, ''), lower(v_invite.email)),
    v_first_name,
    v_last_name,
    v_full_name,
    v_invite.company_name,
    v_phone,
    v_profile_role,
    true
  )
  on conflict (id) do update
  set email = coalesce(nullif(public.profiles.email, ''), excluded.email),
      first_name = coalesce(nullif(excluded.first_name, ''), public.profiles.first_name),
      last_name = coalesce(nullif(excluded.last_name, ''), public.profiles.last_name),
      full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
      company_name = coalesce(nullif(excluded.company_name, ''), public.profiles.company_name),
      phone_number = coalesce(nullif(excluded.phone_number, ''), public.profiles.phone_number),
      role = case
        when public.profiles.role is null or public.profiles.role in ('', 'viewer', 'client') then excluded.role
        else public.profiles.role
      end,
      onboarding_completed = true,
      updated_at = v_now;

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
        preferred = coalesce(preferred, false),
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
      v_user_id
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
    v_user_id,
    v_invite.role_type,
    v_invite.id
  )
  on conflict (transaction_id, user_id, access_role) do update
  set created_by_invitation_id = excluded.created_by_invitation_id,
      updated_at = v_now
  returning id into v_access_id;

  update public.transaction_participants
  set user_id = v_user_id,
      role_type = v_shape.role_type,
      legal_role = v_shape.legal_role,
      transaction_role = v_shape.transaction_role,
      status = 'active',
      participant_name = coalesce(v_full_name, v_invite.contact_name, v_invite.company_name),
      participant_email = coalesce(nullif(v_email, ''), lower(v_invite.email)),
      accepted_at = v_now,
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
  where id = (
    select participant.id
    from public.transaction_participants participant
    where participant.transaction_partner_invitation_id = v_invite.id
      and participant.removed_at is null
    order by participant.updated_at desc nulls last, participant.created_at desc nulls last
    limit 1
  )
  returning id into v_participant_id;

  if v_participant_id is null then
    update public.transaction_participants
    set user_id = v_user_id,
        role_type = v_shape.role_type,
        legal_role = v_shape.legal_role,
        transaction_role = v_shape.transaction_role,
        status = 'active',
        participant_name = coalesce(v_full_name, v_invite.contact_name, v_invite.company_name),
        participant_email = coalesce(nullif(v_email, ''), lower(v_invite.email)),
        accepted_at = v_now,
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
    where id = (
      select participant.id
      from public.transaction_participants participant
      where participant.transaction_id = v_invite.transaction_id
        and participant.role_type = v_shape.role_type
        and participant.legal_role = v_shape.legal_role
        and participant.removed_at is null
        and (
          lower(coalesce(participant.participant_email, '')) = lower(v_invite.email)
          or participant.transaction_partner_invitation_id is null
        )
      order by
        case when lower(coalesce(participant.participant_email, '')) = lower(v_invite.email) then 0 else 1 end,
        participant.updated_at desc nulls last,
        participant.created_at desc nulls last
      limit 1
    )
    returning id into v_participant_id;
  end if;

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
      v_user_id,
      v_shape.role_type,
      v_shape.legal_role,
      v_shape.transaction_role,
      'active',
      coalesce(v_full_name, v_invite.contact_name, v_invite.company_name),
      coalesce(nullif(v_email, ''), lower(v_invite.email)),
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
       or lower(coalesce(public.transaction_participants.participant_email, '')) = lower(v_invite.email)
    returning id into v_participant_id;
  end if;

  update public.transaction_role_players
  set user_id = v_user_id,
      assigned_user_id = v_user_id,
      contact_person = coalesce(contact_person, v_full_name, v_invite.contact_name),
      email_address = coalesce(nullif(v_email, ''), lower(v_invite.email)),
      status = 'active',
      assignment_status = 'active',
      activation_trigger = 'invitation_accepted',
      activated_at = v_now,
      transaction_partner_invitation_id = v_invite.id,
      partner_organisation_id = v_accepting_organisation_id,
      partner_relationship_id = v_partner_relationship_id,
      updated_at = v_now
  where transaction_id = v_invite.transaction_id
    and role_type = v_shape.transaction_role
    and (
      transaction_partner_invitation_id = v_invite.id
      or lower(coalesce(email_address, '')) = lower(v_invite.email)
    );

  begin
    if v_invite.partner_prospect_id is not null then
      update public.partner_prospects
      set status = case when status in ('declined', 'inactive') then status else 'joined' end,
          bridge_user_id = coalesce(bridge_user_id, v_user_id),
          organisation_id = coalesce(organisation_id, v_accepting_organisation_id),
          organization_id = coalesce(organization_id, v_accepting_organisation_id),
          updated_at = v_now
      where id = v_invite.partner_prospect_id;
    end if;
  exception
    when undefined_table or undefined_column then
      null;
  end;

  update public.transaction_partner_invitations
  set status = 'accepted',
      accepted_user_id = v_user_id,
      accepted_at = v_now,
      invitation_token = null,
      organisation_id = v_accepting_organisation_id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'acceptedTransactionUserAccessId', v_access_id,
        'acceptedTransactionParticipantId', v_participant_id,
        'acceptedPartnerRelationshipId', v_partner_relationship_id,
        'acceptedPartnerOrganisationId', v_accepting_organisation_id,
        'acceptedOwnerOrganisationId', v_owner_organisation_id,
        'acceptedEmail', coalesce(nullif(v_email, ''), lower(v_invite.email))
      )
  where id = v_invite.id;

  select exists (
    select 1
    from public.transaction_user_access
    where transaction_id = v_invite.transaction_id
      and user_id = v_user_id
  )
  into v_access_confirmed;

  perform public.bridge_log_transaction_partner_invitation_event(
    v_invite.transaction_id,
    'Invitation Accepted',
    v_user_id,
    jsonb_build_object(
      'invitationId', v_invite.id,
      'accessId', v_access_id,
      'participantId', v_participant_id,
      'partnerRelationshipId', v_partner_relationship_id,
      'ownerOrganisationId', v_owner_organisation_id,
      'partnerOrganisationId', v_accepting_organisation_id,
      'roleType', v_invite.role_type,
      'companyName', v_invite.company_name,
      'contactName', coalesce(v_full_name, v_invite.contact_name),
      'email', coalesce(nullif(v_email, ''), lower(v_invite.email)),
      'accessConfirmed', v_access_confirmed
    )
  );

  return jsonb_build_object(
    'success', true,
    'transactionId', v_invite.transaction_id,
    'invitationId', v_invite.id,
    'accessId', v_access_id,
    'participantId', v_participant_id,
    'partnerRelationshipId', v_partner_relationship_id,
    'ownerOrganisationId', v_owner_organisation_id,
    'partnerOrganisationId', v_accepting_organisation_id,
    'roleType', v_invite.role_type,
    'roleLabel', v_shape.role_label,
    'accessConfirmed', v_access_confirmed,
    'partnerConnectionConfirmed', v_partner_relationship_id is not null,
    'nextPath', '/transactions/' || v_invite.transaction_id::text
  );
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
$function$
;
revoke all on function handoff_private.accept_transaction_partner_invitation_legacy(text,jsonb,uuid) from public,anon,authenticated;
