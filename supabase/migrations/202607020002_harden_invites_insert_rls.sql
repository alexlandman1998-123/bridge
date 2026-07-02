begin;

create or replace function public.bridge_prepare_invite_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.inviter_user_id is null then
    new.inviter_user_id := auth.uid();
  end if;

  if new.metadata is null then
    new.metadata := '{}'::jsonb;
  end if;

  return new;
end;
$$;

drop trigger if exists invites_prepare_insert on public.invites;
create trigger invites_prepare_insert
before insert on public.invites
for each row
execute function public.bridge_prepare_invite_insert();

drop policy if exists invites_insert_workspace_admin on public.invites;
create policy invites_insert_workspace_admin
  on public.invites
  for insert
  to authenticated
  with check (
    coalesce(inviter_user_id, auth.uid()) = auth.uid()
    and (
      target_workspace_id is null
      or exists (
        select 1
        from public.organisation_users ou
        where ou.organisation_id = invites.target_workspace_id
          and ou.user_id = auth.uid()
          and lower(coalesce(ou.status, 'active')) = 'active'
          and coalesce(ou.workspace_role, ou.organisation_role, ou.role) in (
            'owner',
            'super_admin',
            'principal',
            'director',
            'partner',
            'admin',
            'admin_staff',
            'branch_manager',
            'branch_admin',
            'manager',
            'team_lead'
          )
      )
    )
  );

drop policy if exists invites_insert_active_workspace_member_fallback on public.invites;
create policy invites_insert_active_workspace_member_fallback
  on public.invites
  for insert
  to authenticated
  with check (
    invite_type in (
      'workspace_invite',
      'branch_invite',
      'team_invite',
      'principal_claim_invite'
    )
    and target_workspace_id is not null
    and exists (
      select 1
      from public.organisation_users ou
      where ou.organisation_id = invites.target_workspace_id
        and ou.user_id = auth.uid()
        and lower(coalesce(ou.status, 'active')) = 'active'
        and coalesce(ou.workspace_role, ou.organisation_role, ou.role) in (
          'owner',
          'super_admin',
          'principal',
          'director',
          'partner',
          'admin',
          'admin_staff',
          'branch_manager',
          'branch_admin',
          'manager',
          'team_lead'
        )
    )
  );

commit;
