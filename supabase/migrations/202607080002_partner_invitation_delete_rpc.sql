begin;

create or replace function public.bridge_membership_role(target_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with membership as (
    select lower(trim(coalesce(
      nullif(trim(ou.workspace_role), ''),
      nullif(trim(ou.organisation_role), ''),
      nullif(trim(ou.role), ''),
      nullif(trim(ou.app_role), '')
    ))) as raw_role,
    ou.created_at
    from public.organisation_users ou
    where ou.organisation_id = target_org
      and ou.user_id = auth.uid()
      and lower(coalesce(ou.status, 'active')) = 'active'
  ),
  normalized as (
    select
      case raw_role
        when 'administrator' then 'admin'
        when 'superadmin' then 'super_admin'
        when 'branch_admin' then 'branch_manager'
        when 'branch manager' then 'branch_manager'
        when 'principal / owner' then 'principal'
        else raw_role
      end as role,
      created_at
    from membership
  )
  select role
  from normalized
  order by case role
    when 'super_admin' then 100
    when 'owner' then 95
    when 'principal' then 90
    when 'director' then 85
    when 'partner' then 80
    when 'admin' then 75
    when 'hq_manager' then 72
    when 'bond_hq_admin' then 72
    when 'bond_hq_manager' then 72
    when 'commercial_hq_admin' then 72
    when 'commercial_hq_manager' then 72
    when 'branch_manager' then 70
    when 'manager' then 65
    else 0
  end desc,
  created_at desc
  limit 1;
$$;

create or replace function public.bridge_is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.bridge_membership_role(target_org) in (
      'super_admin',
      'owner',
      'principal',
      'director',
      'partner',
      'admin',
      'branch_manager',
      'manager',
      'sales_manager',
      'development_manager',
      'developer',
      'hq_manager',
      'bond_hq_admin',
      'bond_hq_manager',
      'commercial_hq_admin',
      'commercial_hq_manager'
    ),
    false
  );
$$;

drop policy if exists partner_invitations_delete_sender_admin on public.partner_invitations;
create policy partner_invitations_delete_sender_admin
on public.partner_invitations
for delete
to authenticated
using (
  public.bridge_is_org_admin(sender_organisation_id)
  and coalesce(status, 'pending') <> 'accepted'
);

grant execute on function public.bridge_membership_role(uuid) to authenticated;
grant execute on function public.bridge_is_org_admin(uuid) to authenticated;
grant delete on public.partner_invitations to authenticated;

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

  if not public.bridge_is_org_admin(v_invitation.sender_organisation_id) then
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

grant execute on function public.bridge_delete_partner_invitation(uuid) to authenticated;

commit;
