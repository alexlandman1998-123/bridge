create or replace function public.arch9_is_admin_user()
returns boolean
language sql
stable
as $$
  with allowed_roles(role) as (
    values
      ('executive'),
      ('executive_level'),
      ('founder'),
      ('super_admin'),
      ('platform_admin'),
      ('internal_admin'),
      ('developer'),
      ('hq_staff'),
      ('admin')
  ),
  app_metadata as (
    select coalesce(auth.jwt() -> 'app_metadata', '{}'::jsonb) as metadata
  ),
  jwt_roles as (
    select lower(replace(trim(metadata ->> 'role'), '-', '_')) as role
    from app_metadata
    union all
    select lower(replace(trim(metadata ->> 'appRole'), '-', '_')) as role
    from app_metadata
    union all
    select lower(replace(trim(metadata ->> 'app_role'), '-', '_')) as role
    from app_metadata
    union all
    select lower(replace(trim(metadata ->> 'systemRole'), '-', '_')) as role
    from app_metadata
    union all
    select lower(replace(trim(metadata ->> 'system_role'), '-', '_')) as role
    from app_metadata
    union all
    select lower(replace(trim(metadata ->> 'workspaceRole'), '-', '_')) as role
    from app_metadata
    union all
    select lower(replace(trim(metadata ->> 'workspace_role'), '-', '_')) as role
    from app_metadata
    union all
    select lower(replace(trim(metadata ->> 'organisationRole'), '-', '_')) as role
    from app_metadata
    union all
    select lower(replace(trim(metadata ->> 'organisation_role'), '-', '_')) as role
    from app_metadata
    union all
    select lower(replace(trim(metadata ->> 'organizationRole'), '-', '_')) as role
    from app_metadata
    union all
    select lower(replace(trim(metadata ->> 'organization_role'), '-', '_')) as role
    from app_metadata
    union all
    select lower(replace(trim(value), '-', '_')) as role
    from app_metadata,
      jsonb_array_elements_text(
        case
          when jsonb_typeof(metadata -> 'roles') = 'array' then metadata -> 'roles'
          else '[]'::jsonb
        end
      ) as value
    union all
    select lower(replace(trim(value), '-', '_')) as role
    from app_metadata,
      jsonb_array_elements_text(
        case
          when jsonb_typeof(metadata -> 'permissions') = 'array' then metadata -> 'permissions'
          else '[]'::jsonb
        end
      ) as value
    union all
    select lower(replace(trim(value), '-', '_')) as role
    from app_metadata,
      jsonb_array_elements_text(
        case
          when jsonb_typeof(metadata -> 'permissionKeys') = 'array' then metadata -> 'permissionKeys'
          else '[]'::jsonb
        end
      ) as value
    union all
    select lower(replace(trim(value), '-', '_')) as role
    from app_metadata,
      jsonb_array_elements_text(
        case
          when jsonb_typeof(metadata -> 'permission_keys') = 'array' then metadata -> 'permission_keys'
          else '[]'::jsonb
        end
      ) as value
  )
  select exists (
    select 1
    from jwt_roles jr
    join allowed_roles ar on ar.role = jr.role
    where jr.role <> ''
  ) or exists (
    select 1
    from public.profiles p
    join allowed_roles ar on ar.role = lower(replace(trim(p.role), '-', '_'))
    where p.id = auth.uid()
  ) or exists (
    select 1
    from public.organisation_users ou
    where ou.user_id = auth.uid()
      and ou.status = 'active'
      and exists (
        select 1
        from allowed_roles ar
        where ar.role in (
          lower(replace(trim(ou.role), '-', '_')),
          lower(replace(trim(ou.workspace_role), '-', '_')),
          lower(replace(trim(ou.organisation_role), '-', '_')),
          lower(replace(trim(ou.app_role), '-', '_'))
        )
      )
  );
$$;

notify pgrst, 'reload schema';

revoke all on table public.prospect_demo_configs from anon, authenticated;
grant select on public.prospect_demo_configs to anon, authenticated;
grant insert, update, delete on public.prospect_demo_configs to authenticated;

notify pgrst, 'reload schema';
