begin;

create or replace function public.bridge_accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_invite public.invites%rowtype;
  v_now timestamptz := now();
  v_membership_id uuid;
  v_participant_id uuid;
  v_workspace_type text;
  v_app_role text;
  v_workspace_role text;
  v_existing_membership public.organisation_users%rowtype;
  v_existing_branch_id uuid;
  v_invited_first_name text;
  v_invited_last_name text;
  v_invited_full_name text;
  v_invited_phone text;
  v_attorney_firm_id uuid;
  v_attorney_department_id uuid;
  v_attorney_role text;
  v_attorney_member_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated', 'message', 'Sign in before accepting this invite.');
  end if;
  if v_token is null then
    return jsonb_build_object('success', false, 'code', 'missing_token', 'message', 'Invite token is required.');
  end if;

  select *
  into v_invite
  from public.invites
  where token = v_token
  for update;

  if v_invite.id is null then
    return jsonb_build_object('success', false, 'code', 'invite_not_found', 'message', 'Invite not found.');
  end if;

  if v_invite.status <> 'pending' then
    return jsonb_build_object('success', false, 'code', 'invite_' || v_invite.status, 'message', 'Invite is not pending.', 'invite_id', v_invite.id);
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < v_now then
    update public.invites
    set status = 'expired', updated_at = v_now
    where id = v_invite.id;
    perform public.bridge_record_invite_event(v_invite.id, 'invite_expired', v_user_id);
    return jsonb_build_object('success', false, 'code', 'invite_expired', 'message', 'This invite has expired.', 'invite_id', v_invite.id);
  end if;

  if coalesce(v_invite.email, '') <> '' and v_email <> lower(v_invite.email) then
    perform public.bridge_record_invite_event(
      v_invite.id,
      'invite_email_mismatch',
      v_user_id,
      jsonb_build_object('signed_in_email', v_email, 'invited_email', lower(v_invite.email))
    );
    return jsonb_build_object('success', false, 'code', 'invite_email_mismatch', 'message', 'Sign in with the invited email address to accept this invite.', 'invite_id', v_invite.id);
  end if;

  v_invited_first_name := nullif(trim(coalesce(v_invite.metadata->>'first_name', v_invite.metadata->>'firstName', '')), '');
  v_invited_last_name := nullif(trim(coalesce(v_invite.metadata->>'last_name', v_invite.metadata->>'surname', v_invite.metadata->>'lastName', '')), '');
  v_invited_full_name := nullif(trim(concat_ws(' ', v_invited_first_name, v_invited_last_name)), '');
  v_invited_phone := nullif(trim(coalesce(v_invite.metadata->>'mobile', v_invite.metadata->>'phone', v_invite.phone, '')), '');

  if v_invite.target_workspace_id is not null and v_invite.invite_type in ('workspace_invite', 'workspace_and_transaction_invite', 'branch_invite', 'team_invite') then
    select coalesce(type, 'agency')
    into v_workspace_type
    from public.organisations
    where id = v_invite.target_workspace_id;

    if v_workspace_type is null then
      return jsonb_build_object('success', false, 'code', 'target_workspace_missing', 'message', 'The invited workspace no longer exists.', 'invite_id', v_invite.id);
    end if;

    v_workspace_role := coalesce(nullif(v_invite.target_workspace_role, ''), 'agent');
    v_app_role := case
      when v_workspace_type = 'attorney_firm' then 'attorney'
      when v_workspace_type = 'developer_company' then 'developer'
      when v_workspace_type = 'bond_originator' then 'bond_originator'
      else 'agent'
    end;

    select *
    into v_existing_membership
    from public.organisation_users
    where organisation_id = v_invite.target_workspace_id
      and (user_id = v_user_id or lower(coalesce(email, '')) = v_email)
    order by case when status = 'active' then 0 else 1 end, created_at asc
    limit 1
    for update;

    v_existing_branch_id := coalesce(v_existing_membership.primary_branch_id, v_existing_membership.branch_id);

    if
      v_existing_membership.id is not null
      and v_invite.target_branch_id is not null
      and v_existing_branch_id is not null
      and v_existing_branch_id is distinct from v_invite.target_branch_id
    then
      perform public.bridge_record_invite_event(
        v_invite.id,
        'invite_branch_mismatch',
        v_user_id,
        jsonb_build_object(
          'membership_id', v_existing_membership.id,
          'current_branch_id', v_existing_branch_id,
          'target_branch_id', v_invite.target_branch_id
        )
      );
      return jsonb_build_object(
        'success', false,
        'code', 'existing_membership_branch_mismatch',
        'message', 'This account already belongs to a different branch. Ask a principal or admin to transfer the membership before accepting this invite.',
        'invite_id', v_invite.id,
        'membership_id', v_existing_membership.id,
        'current_branch_id', v_existing_branch_id,
        'target_branch_id', v_invite.target_branch_id
      );
    end if;

    if v_existing_membership.id is not null then
      update public.organisation_users
      set
        user_id = v_user_id,
        email = v_email,
        first_name = coalesce(nullif(first_name, ''), v_invited_first_name),
        last_name = coalesce(nullif(last_name, ''), v_invited_last_name),
        role = coalesce(nullif(role, ''), v_workspace_role),
        workspace_role = coalesce(nullif(workspace_role, ''), v_workspace_role),
        organisation_role = coalesce(nullif(organisation_role, ''), v_workspace_role),
        app_role = coalesce(nullif(app_role, ''), v_app_role),
        workspace_type = coalesce(nullif(workspace_type, ''), v_workspace_type),
        branch_id = coalesce(branch_id, v_invite.target_branch_id),
        primary_branch_id = coalesce(primary_branch_id, branch_id, v_invite.target_branch_id),
        status = 'active',
        accepted_at = coalesce(accepted_at, v_now),
        joined_at = coalesce(joined_at, v_now),
        updated_at = v_now
      where id = v_existing_membership.id
      returning id into v_membership_id;
    else
      insert into public.organisation_users (
        organisation_id,
        user_id,
        branch_id,
        primary_branch_id,
        first_name,
        last_name,
        email,
        role,
        workspace_role,
        organisation_role,
        app_role,
        workspace_type,
        status,
        invited_by_user_id,
        invited_at,
        accepted_at,
        joined_at,
        created_by
      )
      values (
        v_invite.target_workspace_id,
        v_user_id,
        v_invite.target_branch_id,
        v_invite.target_branch_id,
        v_invited_first_name,
        v_invited_last_name,
        v_email,
        v_workspace_role,
        v_workspace_role,
        v_workspace_role,
        v_app_role,
        v_workspace_type,
        'active',
        v_invite.inviter_user_id,
        v_invite.created_at,
        v_now,
        v_now,
        v_invite.inviter_user_id
      )
      returning id into v_membership_id;
    end if;

    insert into public.user_workspace_preferences (
      user_id,
      active_workspace_id,
      active_workspace_source
    )
    values (
      v_user_id,
      v_invite.target_workspace_id,
      'user_selected'
    )
    on conflict (user_id) do update
    set active_workspace_id = excluded.active_workspace_id,
        active_workspace_source = excluded.active_workspace_source,
        updated_at = now();

    update public.profiles
    set first_name = coalesce(nullif(first_name, ''), v_invited_first_name),
        last_name = coalesce(nullif(last_name, ''), v_invited_last_name),
        full_name = coalesce(nullif(full_name, ''), v_invited_full_name),
        phone_number = coalesce(nullif(phone_number, ''), v_invited_phone),
        onboarding_completed = true,
        updated_at = now()
    where id = v_user_id;

    insert into public.onboarding_events (
      user_id,
      workspace_id,
      onboarding_step,
      event_type,
      metadata
    )
    values (
      v_user_id,
      v_invite.target_workspace_id,
      'create_or_join_workspace',
      'workspace_invite_accepted',
      jsonb_build_object('invite_id', v_invite.id, 'membership_id', v_membership_id)
    );

    perform public.bridge_record_invite_event(v_invite.id, 'membership_created_from_invite', v_user_id, jsonb_build_object('membership_id', v_membership_id));
  end if;

  if
    v_invite.target_workspace_id is null
    and v_invite.invite_type = 'workspace_invite'
    and coalesce(v_invite.metadata->>'legacy_source', '') = 'attorney_firm_invitations'
  then
    v_attorney_firm_id := nullif(v_invite.metadata->>'attorney_firm_id', '')::uuid;
    v_attorney_department_id := nullif(v_invite.metadata->>'department_id', '')::uuid;
    v_attorney_role := coalesce(nullif(v_invite.target_workspace_role, ''), 'transfer_attorney');

    if v_attorney_firm_id is null or not exists (
      select 1 from public.attorney_firms af where af.id = v_attorney_firm_id and af.is_active = true
    ) then
      return jsonb_build_object('success', false, 'code', 'target_workspace_missing', 'message', 'The invited attorney firm no longer exists.', 'invite_id', v_invite.id);
    end if;

    insert into public.attorney_firm_members (
      firm_id,
      user_id,
      department_id,
      role,
      status,
      invited_by,
      joined_at
    )
    values (
      v_attorney_firm_id,
      v_user_id,
      v_attorney_department_id,
      v_attorney_role,
      'active',
      v_invite.inviter_user_id,
      v_now
    )
    on conflict (firm_id, user_id) do update
    set department_id = coalesce(attorney_firm_members.department_id, excluded.department_id),
        role = coalesce(nullif(attorney_firm_members.role, ''), excluded.role),
        status = 'active',
        invited_by = coalesce(attorney_firm_members.invited_by, excluded.invited_by),
        joined_at = coalesce(attorney_firm_members.joined_at, excluded.joined_at),
        updated_at = v_now
    returning id into v_attorney_member_id;

    update public.attorney_firm_invitations
    set status = 'accepted',
        accepted_at = v_now,
        updated_at = v_now
    where token = v_invite.token;

    update public.profiles
    set primary_attorney_firm_id = coalesce(primary_attorney_firm_id, v_attorney_firm_id),
        attorney_role = coalesce(nullif(attorney_role, ''), v_attorney_role),
        onboarding_completed = true,
        updated_at = v_now
    where id = v_user_id;

    perform public.bridge_record_invite_event(
      v_invite.id,
      'attorney_firm_membership_created_from_invite',
      v_user_id,
      jsonb_build_object('attorney_firm_id', v_attorney_firm_id, 'attorney_member_id', v_attorney_member_id)
    );
  end if;

  if v_invite.target_transaction_id is not null and v_invite.invite_type in ('transaction_invite', 'workspace_and_transaction_invite', 'client_invite', 'external_collaborator_invite') then
    select id
    into v_participant_id
    from public.transaction_participants
    where transaction_id = v_invite.target_transaction_id
      and (
        user_id = v_user_id
        or lower(coalesce(participant_email, '')) = v_email
      )
      and coalesce(role_type, '') = coalesce(nullif(v_invite.target_transaction_role, ''), role_type, '')
    order by created_at asc
    limit 1
    for update;

    if v_participant_id is not null then
      update public.transaction_participants
      set user_id = v_user_id,
          participant_email = v_email,
          status = 'active',
          transaction_role = coalesce(
            transaction_role,
            case
              when coalesce(role_type, v_invite.target_transaction_role) = 'attorney' and legal_role = 'bond' then 'bond_attorney'
              when coalesce(role_type, v_invite.target_transaction_role) = 'attorney' then 'transfer_attorney'
              when coalesce(role_type, v_invite.target_transaction_role) = 'agent' then 'listing_agent'
              when coalesce(role_type, v_invite.target_transaction_role) = 'developer' then 'developer_contact'
              when coalesce(role_type, v_invite.target_transaction_role) = 'bond_originator' then 'bond_originator'
              when coalesce(role_type, v_invite.target_transaction_role) in ('buyer', 'client') then 'buyer'
              when coalesce(role_type, v_invite.target_transaction_role) = 'seller' then 'seller'
              else 'external_collaborator'
            end
          ),
          accepted_at = coalesce(accepted_at, v_now),
          invitation_token = null,
          invitation_expires_at = null,
          updated_at = v_now
      where id = v_participant_id;
    else
      insert into public.transaction_participants (
        transaction_id,
        user_id,
        role_type,
        transaction_role,
        status,
        participant_email,
        invited_by_user_id,
        invited_at,
        accepted_at,
        visibility_scope,
        is_internal,
        can_view,
        can_comment,
        can_upload_documents
      )
      values (
        v_invite.target_transaction_id,
        v_user_id,
        coalesce(nullif(v_invite.target_transaction_role, ''), 'external_collaborator'),
        case
          when v_invite.target_transaction_role = 'attorney' then 'transfer_attorney'
          when v_invite.target_transaction_role = 'agent' then 'listing_agent'
          when v_invite.target_transaction_role = 'developer' then 'developer_contact'
          when v_invite.target_transaction_role = 'bond_originator' then 'bond_originator'
          when v_invite.target_transaction_role in ('buyer', 'client') then 'buyer'
          when v_invite.target_transaction_role = 'seller' then 'seller'
          else coalesce(nullif(v_invite.target_transaction_role, ''), 'external_collaborator')
        end,
        'active',
        v_email,
        v_invite.inviter_user_id,
        v_invite.created_at,
        v_now,
        case when v_invite.invite_type = 'client_invite' then 'client' else 'shared' end,
        false,
        true,
        true,
        true
      )
      returning id into v_participant_id;
    end if;

    perform public.bridge_record_invite_event(v_invite.id, 'participant_created_from_invite', v_user_id, jsonb_build_object('participant_id', v_participant_id));
  end if;

  update public.invites
  set status = 'accepted',
      invitee_user_id = v_user_id,
      accepted_by_user_id = v_user_id,
      accepted_at = v_now,
      updated_at = v_now
  where id = v_invite.id;

  perform public.bridge_record_invite_event(v_invite.id, 'invite_accepted', v_user_id);

  return jsonb_build_object(
    'success', true,
    'invite_id', v_invite.id,
    'invite_type', v_invite.invite_type,
    'workspace_id', v_invite.target_workspace_id,
    'membership_id', v_membership_id,
    'attorney_firm_id', v_attorney_firm_id,
    'attorney_member_id', v_attorney_member_id,
    'transaction_id', v_invite.target_transaction_id,
    'participant_id', v_participant_id,
    'redirect_to', case
      when v_invite.target_transaction_id is not null then '/transactions/' || v_invite.target_transaction_id::text
      when v_attorney_firm_id is not null then '/attorney/dashboard'
      when v_invite.target_workspace_id is not null then '/dashboard'
      else '/dashboard'
    end
  );
end;
$$;

grant execute on function public.bridge_accept_invite(text) to authenticated;

commit;
