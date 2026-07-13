begin;

create or replace function public.bridge_membership_role(target_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select
    case lower(trim(coalesce(ou.workspace_role, ou.organization_role, ou.organisation_role, ou.role, '')))
      when 'administrator' then 'admin'
      when 'owner' then 'principal'
      when 'superadmin' then 'super_admin'
      when 'branch_admin' then 'branch_manager'
      when 'branch manager' then 'branch_manager'
      when 'principal / owner' then 'principal'
      else lower(trim(coalesce(ou.workspace_role, ou.organization_role, ou.organisation_role, ou.role, '')))
    end
  from public.organisation_users ou
  where ou.organisation_id = target_org
    and auth.uid() is not null
    and (
      ou.user_id = auth.uid()
      or (
        ou.user_id is null
        and nullif(lower(trim(ou.email)), '') is not null
        and lower(trim(ou.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
    )
    and lower(trim(coalesce(ou.membership_status, ou.status, ''))) in ('active', 'accepted')
  order by case when ou.user_id = auth.uid() then 0 else 1 end, ou.created_at asc
  limit 1;
$$;

create or replace function public.bridge_is_active_member(target_org uuid)
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
      and auth.uid() is not null
      and (
        ou.user_id = auth.uid()
        or (
          ou.user_id is null
          and nullif(lower(trim(ou.email)), '') is not null
          and lower(trim(ou.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        )
      )
      and lower(trim(coalesce(ou.membership_status, ou.status, ''))) in ('active', 'accepted')
  );
$$;

grant execute on function public.bridge_membership_role(uuid) to authenticated;
grant execute on function public.bridge_is_active_member(uuid) to authenticated;

commit;
