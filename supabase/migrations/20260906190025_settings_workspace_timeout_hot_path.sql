-- Keep the settings/workspace bootstrap path below the PostgREST statement timeout.
-- These predicates are used by bridge_is_active_member() for every settings row
-- exposed through RLS, as well as by the consolidated workspace-context RPC.
begin;

create index if not exists organisation_settings_organisation_id_hot_path_idx
  on public.organisation_settings (organisation_id);

create index if not exists organisation_users_active_member_by_org_user_idx
  on public.organisation_users (organisation_id, user_id, created_at)
  where user_id is not null
    and lower(trim(coalesce(membership_status, status, ''))) in ('active', 'accepted');

create index if not exists organisation_users_active_member_by_org_email_idx
  on public.organisation_users (organisation_id, lower(trim(email)), created_at)
  where user_id is null
    and email is not null
    and lower(trim(coalesce(membership_status, status, ''))) in ('active', 'accepted');

-- Split the user-id and pending-email checks into separate indexable branches.
-- The previous OR condition caused repeated scans of organisation_users while RLS
-- evaluated the single organisation_settings row on settings pages.
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
      and ou.user_id = auth.uid()
      and lower(trim(coalesce(ou.membership_status, ou.status, ''))) in ('active', 'accepted')

    union all

    select 1
    from public.organisation_users ou
    where ou.organisation_id = target_org
      and auth.uid() is not null
      and ou.user_id is null
      and nullif(lower(trim(ou.email)), '') is not null
      and lower(trim(ou.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      and lower(trim(coalesce(ou.membership_status, ou.status, ''))) in ('active', 'accepted')
  );
$$;

create or replace function public.bridge_membership_role(target_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role_value
  from (
    select
      case lower(trim(coalesce(ou.workspace_role, ou.organization_role, ou.organisation_role, ou.role, '')))
        when 'administrator' then 'admin'
        when 'owner' then 'principal'
        when 'superadmin' then 'super_admin'
        when 'branch_admin' then 'branch_manager'
        when 'branch manager' then 'branch_manager'
        when 'principal / owner' then 'principal'
        else lower(trim(coalesce(ou.workspace_role, ou.organization_role, ou.organisation_role, ou.role, '')))
      end as role_value,
      0 as source_priority,
      ou.created_at
    from public.organisation_users ou
    where ou.organisation_id = target_org
      and auth.uid() is not null
      and ou.user_id = auth.uid()
      and lower(trim(coalesce(ou.membership_status, ou.status, ''))) in ('active', 'accepted')

    union all

    select
      case lower(trim(coalesce(ou.workspace_role, ou.organization_role, ou.organisation_role, ou.role, '')))
        when 'administrator' then 'admin'
        when 'owner' then 'principal'
        when 'superadmin' then 'super_admin'
        when 'branch_admin' then 'branch_manager'
        when 'branch manager' then 'branch_manager'
        when 'principal / owner' then 'principal'
        else lower(trim(coalesce(ou.workspace_role, ou.organization_role, ou.organisation_role, ou.role, '')))
      end as role_value,
      1 as source_priority,
      ou.created_at
    from public.organisation_users ou
    where ou.organisation_id = target_org
      and auth.uid() is not null
      and ou.user_id is null
      and nullif(lower(trim(ou.email)), '') is not null
      and lower(trim(ou.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      and lower(trim(coalesce(ou.membership_status, ou.status, ''))) in ('active', 'accepted')
  ) candidates
  order by source_priority, created_at asc
  limit 1;
$$;

grant execute on function public.bridge_membership_role(uuid) to authenticated;
grant execute on function public.bridge_is_active_member(uuid) to authenticated;

commit;
