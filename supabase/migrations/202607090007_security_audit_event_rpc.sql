begin;

create or replace function public.bridge_record_security_audit_event(
  p_user_id text default null,
  p_workspace_id text default null,
  p_action text default null,
  p_target_type text default null,
  p_target_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_requested_user_id text := nullif(trim(coalesce(p_user_id, '')), '');
  v_requested_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_workspace_id uuid := null;
  v_action text := nullif(trim(coalesce(p_action, '')), '');
  v_target_type text := nullif(trim(coalesce(p_target_type, '')), '');
  v_target_id text := nullif(trim(coalesce(p_target_id, '')), '');
  v_metadata jsonb := case
    when p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then '{}'::jsonb
    else p_metadata
  end;
  v_transaction_id uuid := null;
  v_event_id uuid;
  v_uuid_pattern text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_target_transaction_prefix text;
begin
  if v_auth_user_id is null then
    return jsonb_build_object('success', false, 'persisted', false, 'code', 'not_authenticated');
  end if;

  if v_action is null then
    return jsonb_build_object('success', false, 'persisted', false, 'code', 'missing_action');
  end if;

  if v_requested_workspace_id ~* v_uuid_pattern then
    select org.id
    into v_workspace_id
    from public.organisations org
    where org.id = v_requested_workspace_id::uuid
    limit 1;
  end if;

  if v_requested_workspace_id is not null and v_workspace_id is null then
    v_metadata := v_metadata || jsonb_build_object(
      'requestedWorkspaceId', v_requested_workspace_id,
      'workspaceForeignKeySkipped', true
    );
  end if;

  if coalesce(v_metadata ->> 'transactionId', '') ~* v_uuid_pattern then
    v_transaction_id := (v_metadata ->> 'transactionId')::uuid;
  elsif coalesce(v_metadata ->> 'transaction_id', '') ~* v_uuid_pattern then
    v_transaction_id := (v_metadata ->> 'transaction_id')::uuid;
  elsif v_target_type = 'transaction' and coalesce(v_target_id, '') ~* v_uuid_pattern then
    v_transaction_id := v_target_id::uuid;
  elsif coalesce(v_target_id, '') ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}[:|/]' then
    v_target_transaction_prefix := substring(v_target_id from 1 for 36);
    if v_target_transaction_prefix ~* v_uuid_pattern then
      v_transaction_id := v_target_transaction_prefix::uuid;
    end if;
  end if;

  if v_transaction_id is not null then
    if not public.bridge_can_access_transaction_spine(v_transaction_id) then
      return jsonb_build_object('success', false, 'persisted', false, 'code', 'transaction_not_authorized');
    end if;

    if v_workspace_id is null then
      select t.organisation_id
      into v_workspace_id
      from public.transactions t
      where t.id = v_transaction_id
      limit 1;
    end if;
  elsif v_workspace_id is not null then
    if not exists (
      select 1
      from public.organisation_users ou
      where ou.organisation_id = v_workspace_id
        and ou.user_id = v_auth_user_id
        and coalesce(ou.status, 'active') in ('active', 'accepted')
    ) then
      return jsonb_build_object('success', false, 'persisted', false, 'code', 'workspace_not_authorized');
    end if;
  end if;

  if v_requested_user_id is not null and v_requested_user_id <> v_auth_user_id::text then
    v_metadata := v_metadata || jsonb_build_object('requestedUserId', v_requested_user_id);
  end if;

  v_metadata := v_metadata || jsonb_build_object(
    'recordedByUserId', v_auth_user_id,
    'recordedVia', 'bridge_record_security_audit_event'
  );

  insert into public.security_audit_events (
    user_id,
    workspace_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    v_auth_user_id,
    v_workspace_id,
    v_action,
    v_target_type,
    v_target_id,
    v_metadata
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'success', true,
    'persisted', true,
    'id', v_event_id,
    'userId', v_auth_user_id,
    'workspaceId', v_workspace_id
  );
end;
$$;

revoke execute on function public.bridge_record_security_audit_event(text, text, text, text, text, jsonb) from public;
revoke execute on function public.bridge_record_security_audit_event(text, text, text, text, text, jsonb) from anon;
grant execute on function public.bridge_record_security_audit_event(text, text, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
