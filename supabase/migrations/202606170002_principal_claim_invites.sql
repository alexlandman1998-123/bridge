begin;

alter table if exists public.invites
  drop constraint if exists invites_invite_type_check;

alter table if exists public.invites
  add constraint invites_invite_type_check check (
    invite_type in (
      'workspace_invite',
      'transaction_invite',
      'workspace_and_transaction_invite',
      'branch_invite',
      'team_invite',
      'principal_claim_invite',
      'client_invite',
      'external_collaborator_invite'
    )
  );

create or replace function public.bridge_create_principal_claim_invite(payload jsonb)
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
  v_workspace_id uuid := nullif(v_payload->>'target_workspace_id', '')::uuid;
  v_email text := nullif(lower(trim(coalesce(v_payload->>'email', v_payload->>'invited_email', ''))), '');
  v_phone text := nullif(trim(coalesce(v_payload->>'phone', '')), '');
  v_metadata jsonb := coalesce(v_payload->'metadata', '{}'::jsonb);
  v_workspace_type text;
  v_workspace_name text;
  v_actor_raw_role text;
  v_actor_role text := 'viewer';
  v_actor_level integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated', 'message', 'Sign in before creating a principal claim invite.');
  end if;

  if v_workspace_id is null then
    return jsonb_build_object('success', false, 'code', 'target_workspace_required', 'message', 'A workspace is required before creating a principal claim invite.');
  end if;

  if v_email is null then
    return jsonb_build_object('success', false, 'code', 'missing_email', 'message', 'Principal email is required.');
  end if;

  select coalesce(o.type, 'agency'), coalesce(nullif(o.display_name, ''), o.name)
  into v_workspace_type, v_workspace_name
  from public.organisations o
  where o.id = v_workspace_id;

  if v_workspace_type is null then
    return jsonb_build_object('success', false, 'code', 'target_workspace_missing', 'message', 'The invited workspace no longer exists.');
  end if;

  if lower(coalesce(v_workspace_type, '')) not in ('agency', 'residential') then
    return jsonb_build_object('success', false, 'code', 'workspace_type_not_supported', 'message', 'Principal claim invites are only available for residential agency workspaces.');
  end if;

  select coalesce(nullif(ou.workspace_role, ''), nullif(ou.organisation_role, ''), nullif(ou.role, ''))
  into v_actor_raw_role
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

  if v_actor_level < 100 then
    return jsonb_build_object('success', false, 'code', 'permission_denied', 'message', 'Only active agents or higher can invite a principal to claim this organisation.');
  end if;

  if exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v_workspace_id
      and lower(coalesce(ou.email, '')) = v_email
      and ou.status = 'active'
  ) then
    return jsonb_build_object('success', false, 'code', 'existing_workspace_member', 'message', 'This email already belongs to an active user in this workspace.');
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
        'invite_type', 'principal_claim_invite',
        'idempotent', true
      );
    end if;
  end if;

  select id
  into v_existing_pending_invite_id
  from public.invites
  where target_workspace_id = v_workspace_id
    and target_branch_id is null
    and lower(coalesce(email, '')) = v_email
    and invite_type = 'principal_claim_invite'
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if v_existing_pending_invite_id is not null then
    return jsonb_build_object(
      'success', false,
      'code', 'duplicate_pending_invite',
      'message', 'This email already has a pending principal claim invite for this workspace.',
      'invite_id', v_existing_pending_invite_id
    );
  end if;

  v_metadata := v_metadata || jsonb_strip_nulls(jsonb_build_object(
    'source', coalesce(nullif(v_metadata->>'source', ''), 'principal_claim_invite'),
    'claim_type', 'residential_principal_claim',
    'requested_role', 'principal',
    'role', 'principal_claim',
    'role_label', 'Principal Claim',
    'workspace_type', v_workspace_type,
    'organisation_name', v_workspace_name
  ));

  insert into public.invites (
    invite_type,
    status,
    token,
    expires_at,
    inviter_user_id,
    target_workspace_id,
    target_workspace_role,
    email,
    phone,
    metadata
  )
  values (
    'principal_claim_invite',
    'pending',
    coalesce(v_token, public.bridge_random_token(24)),
    nullif(v_payload->>'expires_at', '')::timestamptz,
    v_user_id,
    v_workspace_id,
    'principal',
    v_email,
    v_phone,
    v_metadata
  )
  returning id, token into v_invite_id, v_token;

  perform public.bridge_record_invite_event(
    v_invite_id,
    'principal_claim_invite_created',
    v_user_id,
    jsonb_build_object('invite_type', 'principal_claim_invite', 'workspace_id', v_workspace_id)
  );

  return jsonb_build_object(
    'success', true,
    'invite_id', v_invite_id,
    'token', v_token,
    'invite_type', 'principal_claim_invite'
  );
end;
$$;

grant execute on function public.bridge_create_principal_claim_invite(jsonb) to authenticated;

commit;
