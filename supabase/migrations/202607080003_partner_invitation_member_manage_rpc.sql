begin;

create or replace function public.bridge_is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = target_org
      and ou.user_id = auth.uid()
      and coalesce(nullif(lower(trim(ou.status)), ''), 'active') = 'active'
  );
$$;

drop policy if exists partner_invitations_delete_sender_admin on public.partner_invitations;
drop policy if exists partner_invitations_delete_sender_member on public.partner_invitations;

create policy partner_invitations_delete_sender_member
on public.partner_invitations
for delete
to authenticated
using (
  public.bridge_is_org_member(sender_organisation_id)
  and coalesce(status, 'pending') <> 'accepted'
);

create or replace function public.bridge_revoke_partner_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.partner_invitations%rowtype;
  v_revoked_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  if p_invitation_id is null then
    return jsonb_build_object('success', false, 'code', 'missing_invitation_id');
  end if;

  select *
  into v_invitation
  from public.partner_invitations
  where id = p_invitation_id;

  if not found then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  if coalesce(v_invitation.status, 'pending') = 'accepted' then
    return jsonb_build_object('success', false, 'code', 'accepted');
  end if;

  if not public.bridge_is_org_member(v_invitation.sender_organisation_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  update public.partner_invitations
  set
    status = 'revoked',
    responded_by_user_id = auth.uid(),
    responded_at = now()
  where id = p_invitation_id
    and coalesce(status, 'pending') <> 'accepted'
  returning id into v_revoked_id;

  if v_revoked_id is null then
    return jsonb_build_object('success', false, 'code', 'stale');
  end if;

  return jsonb_build_object('success', true, 'code', 'revoked', 'invitation_id', v_revoked_id);
end;
$$;

create or replace function public.bridge_delete_partner_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.partner_invitations%rowtype;
  v_deleted_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  if p_invitation_id is null then
    return jsonb_build_object('success', false, 'code', 'missing_invitation_id');
  end if;

  select *
  into v_invitation
  from public.partner_invitations
  where id = p_invitation_id;

  if not found then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  if coalesce(v_invitation.status, 'pending') = 'accepted' then
    return jsonb_build_object('success', false, 'code', 'accepted');
  end if;

  if not public.bridge_is_org_member(v_invitation.sender_organisation_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  delete from public.partner_invitations
  where id = p_invitation_id
    and coalesce(status, 'pending') <> 'accepted'
  returning id into v_deleted_id;

  if v_deleted_id is null then
    return jsonb_build_object('success', false, 'code', 'stale');
  end if;

  return jsonb_build_object('success', true, 'code', 'deleted', 'invitation_id', v_deleted_id);
end;
$$;

grant execute on function public.bridge_is_org_member(uuid) to authenticated;
grant execute on function public.bridge_revoke_partner_invitation(uuid) to authenticated;
grant execute on function public.bridge_delete_partner_invitation(uuid) to authenticated;
grant update, delete on public.partner_invitations to authenticated;

commit;
