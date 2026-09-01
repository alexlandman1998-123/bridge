begin;

-- Admin authorization must be derived from auth.app_metadata only. Users can
-- update auth.user_metadata themselves, so it must never grant admin access.
create or replace function public.arch9_admin_jwt_role_tokens()
returns text[]
language sql
stable
security invoker
set search_path = public
as $$
  with claims as (
    select coalesce(auth.jwt() -> 'app_metadata', '{}'::jsonb) as metadata
  ),
  scalar_tokens as (
    select public.arch9_admin_normalize_token(value) as token
    from claims,
    lateral (
      values
        (metadata ->> 'role'),
        (metadata ->> 'app_role'),
        (metadata ->> 'system_role')
    ) as tokens(value)
  ),
  array_tokens as (
    select public.arch9_admin_normalize_token(value) as token
    from claims,
    lateral jsonb_array_elements_text(coalesce(metadata -> 'roles', '[]'::jsonb)) as roles(value)
    union all
    select public.arch9_admin_normalize_token(value) as token
    from claims,
    lateral jsonb_array_elements_text(coalesce(metadata -> 'permissions', '[]'::jsonb)) as permissions(value)
  )
  select coalesce(array_agg(distinct token) filter (where token <> ''), array[]::text[])
  from (
    select token from scalar_tokens
    union all
    select token from array_tokens
  ) collected;
$$;

revoke all on function public.arch9_admin_jwt_role_tokens() from public, anon;
grant execute on function public.arch9_admin_jwt_role_tokens() to authenticated, service_role;

create or replace function public.arch9_admin_access_level()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with roles as (
    select public.arch9_admin_jwt_role_tokens() as tokens
  ),
  access as (
    select case
      when auth.uid() is null then ''
      when tokens && array[
        'executive', 'executive_level', 'founder', 'super_admin',
        'platform_admin', 'internal_admin', 'developer', 'hq_staff', 'admin'
      ]::text[] then 'executive'
      when tokens && array[
        'customer_support', 'customer_support_level', 'support_agent'
      ]::text[] then 'customer_support'
      else ''
    end as level,
    tokens
    from roles
  )
  select jsonb_build_object('level', level, 'roles', to_jsonb(tokens))
  from access;
$$;

revoke all on function public.arch9_admin_access_level() from public, anon;
grant execute on function public.arch9_admin_access_level() to authenticated, service_role;

create or replace function public.arch9_admin_can_access_dashboard()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(nullif(public.arch9_admin_access_level() ->> 'level', ''), '') <> '';
$$;

notify pgrst, 'reload schema';
commit;
