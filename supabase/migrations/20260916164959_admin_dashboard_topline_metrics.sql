-- Keep the five dashboard headline figures in one admin-only contract.  The
-- existing dashboard snapshot remains responsible for operational rows.
create or replace function public.arch9_admin_dashboard_topline_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organisations integer := 0;
  v_users integer := 0;
begin
  if not public.arch9_admin_can_access_dashboard() then
    raise exception 'admin dashboard access required' using errcode = '42501';
  end if;

  -- An organisation only counts once it has a persisted primary key.  Status
  -- is deliberately not considered here: this is the platform total, not an
  -- "currently active" operating count.
  if to_regclass('public.organisations') is not null then
    select count(*) into v_organisations
    from public.organisations
    where id is not null;
  end if;

  -- Profiles are the canonical platform-user record and include every role.
  -- The legacy users table is retained only as a compatibility fallback.
  if to_regclass('public.profiles') is not null then
    select count(distinct id) into v_users
    from public.profiles
    where id is not null;
  elsif to_regclass('public.users') is not null then
    select count(distinct id) into v_users
    from public.users
    where id is not null;
  end if;

  return jsonb_build_object(
    'organisations', v_organisations,
    'users', v_users
  );
end;
$$;

revoke all on function public.arch9_admin_dashboard_topline_metrics() from public, anon;
grant execute on function public.arch9_admin_dashboard_topline_metrics() to authenticated;

comment on function public.arch9_admin_dashboard_topline_metrics()
  is 'Admin-only platform totals: organisations with a persisted ID and all users with a persisted profile ID.';

notify pgrst, 'reload schema';
