begin;

create or replace function public.bridge_random_token(p_bytes integer default 24)
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_bytes integer := greatest(coalesce(p_bytes, 24), 16);
  v_token text;
begin
  begin
    execute 'select encode(extensions.gen_random_bytes($1), ''hex'')'
      using v_bytes
      into v_token;
    if v_token is not null then
      return v_token;
    end if;
  exception
    when invalid_schema_name or undefined_function then
      null;
  end;

  begin
    execute 'select encode(public.gen_random_bytes($1), ''hex'')'
      using v_bytes
      into v_token;
    if v_token is not null then
      return v_token;
    end if;
  exception
    when invalid_schema_name or undefined_function then
      null;
  end;

  v_token := '';
  while length(v_token) < v_bytes * 2 loop
    v_token := v_token || md5(random()::text || clock_timestamp()::text || txid_current()::text || v_token);
  end loop;

  return substring(v_token from 1 for v_bytes * 2);
end;
$$;

alter table if exists public.invites
  alter column token set default public.bridge_random_token(24);

alter table if exists public.workspace_invites
  alter column token set default public.bridge_random_token(24);

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
  v_token text := nullif(trim(coalesce(v_payload->>'token', '')), '');
  v_invite_type text := nullif(trim(coalesce(v_payload->>'invite_type', 'workspace_invite')), '');
  v_workspace_id uuid := nullif(v_payload->>'target_workspace_id', '')::uuid;
  v_email text := nullif(lower(trim(coalesce(v_payload->>'email', v_payload->>'invited_email', ''))), '');
  v_workspace_role text := nullif(trim(coalesce(v_payload->>'target_workspace_role', v_payload->>'workspace_role', v_payload->>'organisation_role', '')), '');
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated', 'message', 'Sign in before creating an invite.');
  end if;

  if v_email is null then
    return jsonb_build_object('success', false, 'code', 'missing_email', 'message', 'Invite email is required.');
  end if;

  if v_workspace_id is not null and not exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v_workspace_id
      and ou.user_id = v_user_id
      and ou.status = 'active'
      and coalesce(ou.workspace_role, ou.organisation_role, ou.role) in ('owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'branch_manager', 'manager')
  ) then
    return jsonb_build_object('success', false, 'code', 'permission_denied', 'message', 'You do not have permission to invite users to this workspace.');
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
    nullif(v_payload->>'target_branch_id', '')::uuid,
    nullif(v_payload->>'target_team_id', '')::uuid,
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

grant execute on function public.bridge_random_token(integer) to authenticated;
grant execute on function public.bridge_create_invite(jsonb) to authenticated;

commit;
