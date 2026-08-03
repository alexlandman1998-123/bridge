begin;

create or replace function public.bridge_resolve_current_workspace_context(
  target_user_id uuid default null,
  requested_workspace_id text default null,
  user_email text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_user_id uuid := coalesce(target_user_id, auth.uid());
  v_auth_email text := null;
  v_profile jsonb := null;
  v_preference jsonb := null;
  v_organisation_memberships jsonb := '[]'::jsonb;
  v_organisation_rows jsonb := '[]'::jsonb;
  v_attorney_memberships jsonb := '[]'::jsonb;
  v_attorney_firm_rows jsonb := '[]'::jsonb;
  v_user_email text := null;
begin
  if v_auth_user_id is null then
    raise exception 'workspace_context_unauthenticated' using errcode = '42501';
  end if;

  if v_user_id is null or v_user_id <> v_auth_user_id then
    raise exception 'workspace_context_forbidden' using errcode = '42501';
  end if;

  select lower(nullif(trim(au.email), ''))
  into v_auth_email
  from auth.users au
  where au.id = v_user_id;

  if to_regclass('public.profiles') is not null then
    execute $sql$
      select to_jsonb(p)
      from public.profiles p
      where p.id = $1
      limit 1
    $sql$
    into v_profile
    using v_user_id;
  end if;

  v_user_email := coalesce(
    lower(nullif(trim(v_profile->>'email'), '')),
    v_auth_email
  );

  if v_user_email is null and lower(nullif(trim(user_email), '')) = v_auth_email then
    v_user_email := v_auth_email;
  end if;

  if to_regclass('public.user_workspace_preferences') is not null then
    execute $sql$
      select to_jsonb(pref)
      from public.user_workspace_preferences pref
      where pref.user_id = $1
      limit 1
    $sql$
    into v_preference
    using v_user_id;
  end if;

  if to_regclass('public.organisation_users') is not null then
    execute $sql$
      select coalesce(jsonb_agg(row_data order by row_data->>'created_at'), '[]'::jsonb)
      from (
        select to_jsonb(ou) || jsonb_build_object('source_table', 'organisation_users') as row_data
        from public.organisation_users ou
        where ou.user_id = $1
           or ($2 is not null and lower(coalesce(ou.email, '')) = $2)
      ) rows
    $sql$
    into v_organisation_memberships
    using v_user_id, v_user_email;
  end if;

  if to_regclass('public.organisations') is not null then
    execute $sql$
      select coalesce(jsonb_agg(to_jsonb(orgs) order by orgs.id), '[]'::jsonb)
      from public.organisations orgs
      where exists (
        select 1
        from jsonb_array_elements($1) membership
        where nullif(coalesce(membership->>'organisation_id', membership->>'organization_id'), '') = orgs.id::text
      )
         or ($2 is not null and orgs.id::text = $2)
    $sql$
    into v_organisation_rows
    using v_organisation_memberships, requested_workspace_id;
  end if;

  if to_regclass('public.attorney_firm_members') is not null then
    execute $sql$
      select coalesce(jsonb_agg(row_data order by row_data->>'created_at'), '[]'::jsonb)
      from (
        select to_jsonb(afm) as row_data
        from public.attorney_firm_members afm
        where afm.user_id = $1
      ) rows
    $sql$
    into v_attorney_memberships
    using v_user_id;
  end if;

  if to_regclass('public.attorney_firms') is not null then
    execute $sql$
      select coalesce(jsonb_agg(to_jsonb(firms) order by firms.id), '[]'::jsonb)
      from public.attorney_firms firms
      where exists (
        select 1
        from jsonb_array_elements($1) membership
        where nullif(membership->>'firm_id', '') = firms.id::text
      )
         or nullif($2->>'primary_attorney_firm_id', '') = firms.id::text
         or ($3 is not null and firms.id::text = $3)
    $sql$
    into v_attorney_firm_rows
    using v_attorney_memberships, coalesce(v_profile, '{}'::jsonb), requested_workspace_id;
  end if;

  return jsonb_build_object(
    'profile', coalesce(v_profile, 'null'::jsonb),
    'preference', coalesce(v_preference, 'null'::jsonb),
    'organisationMembershipRows', coalesce(v_organisation_memberships, '[]'::jsonb),
    'organisationRows', coalesce(v_organisation_rows, '[]'::jsonb),
    'attorneyMembershipRows', coalesce(v_attorney_memberships, '[]'::jsonb),
    'attorneyFirmRows', coalesce(v_attorney_firm_rows, '[]'::jsonb),
    'diagnostics', jsonb_build_object(
      'source', 'bridge_resolve_current_workspace_context',
      'requestedWorkspaceId', requested_workspace_id,
      'profileSchemaMissing', to_regclass('public.profiles') is null,
      'preferenceSchemaMissing', to_regclass('public.user_workspace_preferences') is null,
      'organisationUsersSchemaMissing', to_regclass('public.organisation_users') is null,
      'organisationsSchemaMissing', to_regclass('public.organisations') is null,
      'attorneyFirmMembersSchemaMissing', to_regclass('public.attorney_firm_members') is null,
      'attorneyFirmsSchemaMissing', to_regclass('public.attorney_firms') is null
    )
  );
end;
$$;

grant execute on function public.bridge_resolve_current_workspace_context(uuid, text, text) to authenticated;

commit;
