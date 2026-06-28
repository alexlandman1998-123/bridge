create or replace function public.bridge_get_transaction_partner_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_invite public.transaction_partner_invitations%rowtype;
  v_tx public.transactions%rowtype;
  v_org_name text := '';
  v_property text := '';
  v_result jsonb;
begin
  begin
    v_token := nullif(trim(p_token), '')::uuid;
  exception
    when invalid_text_representation then
      return jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end;

  if v_token is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_token');
  end if;

  select *
  into v_invite
  from public.transaction_partner_invitations
  where invitation_token = v_token
  limit 1;

  if v_invite.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_invite.status = 'pending' and v_invite.expires_at < now() then
    update public.transaction_partner_invitations
    set status = 'expired', invitation_token = null
    where id = v_invite.id;

    perform public.bridge_log_transaction_partner_invitation_event(
      v_invite.transaction_id,
      'Invitation Expired',
      v_invite.invited_by_user_id,
      jsonb_build_object(
        'invitationId', v_invite.id,
        'roleType', v_invite.role_type,
        'companyName', v_invite.company_name,
        'email', v_invite.email
      )
    );

    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  if v_invite.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', v_invite.status);
  end if;

  select *
  into v_tx
  from public.transactions
  where id = v_invite.transaction_id
  limit 1;

  if v_invite.viewed_at is null then
    update public.transaction_partner_invitations
    set viewed_at = now()
    where id = v_invite.id;

    perform public.bridge_log_transaction_partner_invitation_event(
      v_invite.transaction_id,
      'Invitation Viewed',
      null,
      jsonb_build_object(
        'invitationId', v_invite.id,
        'roleType', v_invite.role_type,
        'companyName', v_invite.company_name,
        'contactName', v_invite.contact_name,
        'email', v_invite.email
      )
    );
  end if;

  begin
    select coalesce(nullif(display_name, ''), nullif(name, ''), '')
    into v_org_name
    from public.organisations
    where id = v_tx.organisation_id
    limit 1;
  exception
    when undefined_table or undefined_column then
      v_org_name := '';
  end;

  v_property := concat_ws(', ',
    nullif(v_tx.property_address_line_1, ''),
    nullif(v_tx.suburb, ''),
    nullif(v_tx.city, '')
  );

  v_result := jsonb_build_object(
    'ok', true,
    'invitation', jsonb_build_object(
      'id', v_invite.id,
      'transactionId', v_invite.transaction_id,
      'roleType', v_invite.role_type,
      'companyName', v_invite.company_name,
      'contactName', v_invite.contact_name,
      'email', v_invite.email,
      'phone', v_invite.phone,
      'status', v_invite.status,
      'expiresAt', v_invite.expires_at,
      'createdAt', v_invite.created_at,
      'invitedByOrganisation', coalesce(nullif(v_org_name, ''), 'Arch9'),
      'transactionReference', coalesce(v_tx.transaction_reference, v_tx.matter_number, v_invite.transaction_id::text),
      'propertyLabel', coalesce(nullif(v_property, ''), v_tx.property_description, 'Property transaction')
    )
  );

  return v_result;
end;
$$;

create or replace function public.bridge_accept_transaction_partner_invitation(
  p_token text,
  p_profile jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_now timestamptz := now();
  v_invite public.transaction_partner_invitations%rowtype;
  v_shape record;
  v_profile_role text;
  v_first_name text;
  v_last_name text;
  v_full_name text;
  v_phone text;
  v_access_id uuid;
  v_participant_id uuid;
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
  into v_shape
  from public.bridge_transaction_partner_invite_role_shape(v_invite.role_type)
  limit 1;

  v_profile_role := coalesce(nullif(p_profile ->> 'role', ''), v_shape.profile_role);
  if v_profile_role not in ('viewer', 'agent', 'developer', 'attorney', 'bond_originator', 'client') then
    v_profile_role := v_shape.profile_role;
  end if;

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
      can_view = true,
      can_comment = true,
      can_upload_documents = true,
      can_edit_finance_workflow = v_invite.role_type = 'bond_originator',
      can_edit_attorney_workflow = v_invite.role_type = 'transfer_attorney',
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
        can_view = true,
        can_comment = true,
        can_upload_documents = true,
        can_edit_finance_workflow = v_invite.role_type = 'bond_originator',
        can_edit_attorney_workflow = v_invite.role_type = 'transfer_attorney',
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
      true,
      true,
      true,
      v_invite.role_type = 'bond_originator',
      v_invite.role_type = 'transfer_attorney',
      false
    )
    on conflict (transaction_id, role_type, legal_role) do update
    set user_id = excluded.user_id,
        status = 'active',
        participant_name = excluded.participant_name,
        participant_email = excluded.participant_email,
        accepted_at = excluded.accepted_at,
        transaction_role = excluded.transaction_role,
        transaction_partner_invitation_id = excluded.transaction_partner_invitation_id,
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
      updated_at = v_now
  where transaction_id = v_invite.transaction_id
    and role_type = v_shape.transaction_role
    and (
      transaction_partner_invitation_id = v_invite.id
      or lower(coalesce(email_address, '')) = lower(v_invite.email)
    );

  update public.transaction_partner_invitations
  set status = 'accepted',
      accepted_user_id = v_user_id,
      accepted_at = v_now,
      invitation_token = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'acceptedTransactionUserAccessId', v_access_id,
        'acceptedTransactionParticipantId', v_participant_id,
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
    'roleType', v_invite.role_type,
    'roleLabel', v_shape.role_label,
    'accessConfirmed', v_access_confirmed,
    'nextPath', '/transactions/' || v_invite.transaction_id::text
  );
end;
$$;

grant execute on function public.bridge_get_transaction_partner_invitation(text) to anon, authenticated;
grant execute on function public.bridge_accept_transaction_partner_invitation(text, jsonb) to authenticated;
