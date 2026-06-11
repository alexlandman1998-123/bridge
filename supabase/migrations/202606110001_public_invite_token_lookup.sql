begin;

create or replace function public.bridge_lookup_invite_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_invite public.invites%rowtype;
  v_workspace jsonb := null;
begin
  if v_token is null then
    return jsonb_build_object('success', false, 'code', 'missing_token');
  end if;

  select *
  into v_invite
  from public.invites
  where token = v_token;

  if v_invite.id is null then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  if v_invite.target_workspace_id is not null then
    select jsonb_build_object(
      'id', o.id,
      'name', o.name,
      'display_name', o.display_name,
      'type', o.type,
      'logo_url', o.logo_url
    )
    into v_workspace
    from public.organisations o
    where o.id = v_invite.target_workspace_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'invite', jsonb_build_object(
      'id', v_invite.id,
      'invite_type', v_invite.invite_type,
      'status', v_invite.status,
      'token', v_invite.token,
      'expires_at', v_invite.expires_at,
      'inviter_user_id', v_invite.inviter_user_id,
      'target_workspace_id', v_invite.target_workspace_id,
      'target_workspace_role', v_invite.target_workspace_role,
      'target_transaction_id', v_invite.target_transaction_id,
      'target_transaction_role', v_invite.target_transaction_role,
      'target_branch_id', v_invite.target_branch_id,
      'target_team_id', v_invite.target_team_id,
      'email', v_invite.email,
      'phone', v_invite.phone,
      'invitee_user_id', v_invite.invitee_user_id,
      'metadata', coalesce(v_invite.metadata, '{}'::jsonb),
      'accepted_at', v_invite.accepted_at,
      'accepted_by_user_id', v_invite.accepted_by_user_id,
      'revoked_at', v_invite.revoked_at,
      'revoked_by_user_id', v_invite.revoked_by_user_id,
      'created_at', v_invite.created_at,
      'updated_at', v_invite.updated_at,
      'organisations', v_workspace
    )
  );
end;
$$;

grant execute on function public.bridge_lookup_invite_by_token(text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
