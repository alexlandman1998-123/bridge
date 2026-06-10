begin;

create index if not exists invites_pending_workspace_branch_email_idx
  on public.invites (target_workspace_id, target_branch_id, lower(email), invite_type)
  where status = 'pending';

create or replace function public.bridge_create_invite(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(payload, '{}'::jsonb);
  v_user_id uuid := auth.uid();
  v_invite_id uuid;
  v_existing_pending_invite_id uuid;
  v_token text := nullif(trim(coalesce(v_payload->>'token', '')), '');
  v_invite_type text := nullif(trim(coalesce(v_payload->>'invite_type', 'workspace_invite')), '');
  v_workspace_id uuid := nullif(v_payload->>'target_workspace_id', '')::uuid;
  v_target_branch_id uuid := nullif(v_payload->>'target_branch_id', '')::uuid;
  v_target_team_id uuid := nullif(v_payload->>'target_team_id', '')::uuid;
  v_email text := nullif(lower(trim(coalesce(v_payload->>'email', v_payload->>'invited_email', ''))), '');
  v_workspace_role text := nullif(trim(coalesce(v_payload->>'target_workspace_role', v_payload->>'workspace_role', v_payload->>'organisation_role', '')), '');
  v_workspace_type text;
  v_actor_raw_role text;
  v_actor_role text := 'viewer';
  v_actor_level integer := 0;
  v_actor_branch_id uuid;
  v_target_role text := 'viewer';
  v_target_level integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated', 'message', 'Sign in before creating an invite.');
  end if;

  if v_email is null then
    return jsonb_build_object('success', false, 'code', 'missing_email', 'message', 'Invite email is required.');
  end if;

  if v_target_branch_id is not null and v_workspace_id is null then
    return jsonb_build_object('success', false, 'code', 'target_workspace_required', 'message', 'Branch invites require a target workspace.');
  end if;

  if v_workspace_id is not null then
    select coalesce(o.type, 'agency')
    into v_workspace_type
    from public.organisations o
    where o.id = v_workspace_id;

    if v_workspace_type is null then
      return jsonb_build_object('success', false, 'code', 'target_workspace_missing', 'message', 'The invited workspace no longer exists.');
    end if;

    select
      coalesce(nullif(ou.workspace_role, ''), nullif(ou.organisation_role, ''), nullif(ou.role, '')),
      coalesce(ou.primary_branch_id, ou.branch_id)
    into v_actor_raw_role, v_actor_branch_id
    from public.organisation_users ou
    where ou.organisation_id = v_workspace_id
      and ou.user_id = v_user_id
      and ou.status = 'active'
    order by ou.created_at asc
    limit 1;

    v_actor_role := case
      when v_actor_raw_role in ('owner', 'super_admin') then 'owner'
      when v_actor_raw_role in ('principal', 'director', 'partner', 'admin', 'admin_staff') then 'principal'
      when v_actor_raw_role in ('branch_manager', 'branch_admin') then 'branch_manager'
      when v_actor_raw_role in ('team_lead', 'manager') then 'team_lead'
      when v_actor_raw_role in ('agent', 'senior_agent', 'sales_agent') then 'agent'
      when v_actor_raw_role in ('assistant', 'transaction_coordinator', 'listing_coordinator', 'admin_coordinator') then 'assistant'
      else 'viewer'
    end;

    v_actor_level := case v_actor_role
      when 'owner' then 500
      when 'principal' then 400
      when 'branch_manager' then 300
      when 'team_lead' then 200
      when 'agent' then 100
      when 'assistant' then 50
      else 0
    end;

    if v_actor_level < 200 then
      return jsonb_build_object('success', false, 'code', 'permission_denied', 'message', 'You do not have permission to invite users to this workspace.');
    end if;

    if v_target_branch_id is not null and not exists (
      select 1
      from public.organisation_branches ob
      where ob.id = v_target_branch_id
        and ob.organisation_id = v_workspace_id
        and coalesce(ob.is_active, true) = true
    ) then
      return jsonb_build_object('success', false, 'code', 'branch_workspace_mismatch', 'message', 'The selected branch does not belong to this workspace.');
    end if;

    if v_workspace_type = 'agency' then
      v_target_role := case
        when v_workspace_role in ('owner', 'super_admin') then 'owner'
        when v_workspace_role in ('principal', 'director', 'partner', 'admin', 'admin_staff') then 'principal'
        when v_workspace_role in ('branch_manager', 'branch_admin') then 'branch_manager'
        when v_workspace_role in ('team_lead', 'manager') then 'team_lead'
        when v_workspace_role in ('agent', 'senior_agent', 'sales_agent') then 'agent'
        when v_workspace_role in ('assistant', 'transaction_coordinator', 'listing_coordinator', 'admin_coordinator') then 'assistant'
        else 'viewer'
      end;

      v_target_level := case v_target_role
        when 'owner' then 500
        when 'principal' then 400
        when 'branch_manager' then 300
        when 'team_lead' then 200
        when 'agent' then 100
        when 'assistant' then 50
        else 0
      end;

      if v_actor_role = 'branch_manager' and v_target_branch_id is null then
        return jsonb_build_object('success', false, 'code', 'branch_scope_required', 'message', 'Branch managers can only invite users to their own branch.');
      end if;

      if v_actor_role = 'branch_manager' and v_actor_branch_id is distinct from v_target_branch_id then
        return jsonb_build_object('success', false, 'code', 'branch_scope_denied', 'message', 'Branch managers can only invite users to their own branch.');
      end if;

      if v_actor_level <= v_target_level then
        return jsonb_build_object('success', false, 'code', 'role_not_permitted', 'message', 'You do not have authority to invite a user at this level.');
      end if;
    end if;
  end if;

  if v_token is not null then
    select id
    into v_invite_id
    from public.invites
    where token = v_token;

    if v_invite_id is not null then
      return jsonb_build_object(
        'success', true,
        'invite_id', v_invite_id,
        'token', v_token,
        'invite_type', v_invite_type,
        'idempotent', true
      );
    end if;
  end if;

  if v_workspace_id is not null then
    select id
    into v_existing_pending_invite_id
    from public.invites
    where target_workspace_id = v_workspace_id
      and target_branch_id is not distinct from v_target_branch_id
      and lower(coalesce(email, '')) = v_email
      and invite_type = v_invite_type
      and status = 'pending'
      and (expires_at is null or expires_at > now())
    order by created_at desc
    limit 1;

    if v_existing_pending_invite_id is not null then
      return jsonb_build_object(
        'success', false,
        'code', 'duplicate_pending_invite',
        'message', 'This email already has a pending invite for this workspace and branch.',
        'invite_id', v_existing_pending_invite_id
      );
    end if;
  end if;

  insert into public.invites (
    invite_type,
    status,
    token,
    expires_at,
    inviter_user_id,
    target_workspace_id,
    target_workspace_role,
    target_transaction_id,
    target_transaction_role,
    target_branch_id,
    target_team_id,
    email,
    phone,
    metadata
  )
  values (
    v_invite_type,
    'pending',
    coalesce(v_token, public.bridge_random_token(24)),
    nullif(v_payload->>'expires_at', '')::timestamptz,
    v_user_id,
    v_workspace_id,
    v_workspace_role,
    nullif(v_payload->>'target_transaction_id', '')::uuid,
    nullif(trim(coalesce(v_payload->>'target_transaction_role', v_payload->>'transaction_role', '')), ''),
    v_target_branch_id,
    v_target_team_id,
    v_email,
    nullif(trim(coalesce(v_payload->>'phone', '')), ''),
    coalesce(v_payload->'metadata', '{}'::jsonb)
  )
  returning id, token into v_invite_id, v_token;

  perform public.bridge_record_invite_event(v_invite_id, 'invite_created', v_user_id, jsonb_build_object('invite_type', v_invite_type));

  return jsonb_build_object(
    'success', true,
    'invite_id', v_invite_id,
    'token', v_token,
    'invite_type', v_invite_type
  );
end;
$$;

grant execute on function public.bridge_create_invite(jsonb) to authenticated;

commit;
