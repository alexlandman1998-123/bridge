begin;

-- Phase 5: server-authoritative ownership health for the active workspace.
-- This is read-only and intentionally uses the same status semantics as the
-- membership-resolution layer, so the UI cannot hide a database anomaly.
create or replace function public.bridge_organisation_ownership_health(
  p_organisation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_member_count integer;
  v_active_owner_count integer;
  v_all_primary_count integer;
  v_active_primary_count integer;
  v_active_primary_owner_count integer;
  v_invalid_primary_role_count integer;
  v_issues text[] := array[]::text[];
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_organisation_id is null then
    raise exception 'An organisation is required for ownership health.' using errcode = '22023';
  end if;
  if not public.bridge_is_platform_admin() and not exists (
    select 1
    from public.organisation_users member
    where member.organisation_id = p_organisation_id
      and member.user_id = auth.uid()
      and coalesce(member.membership_status, member.status) in ('active', 'accepted')
  ) then
    raise exception 'An active organisation membership is required to inspect ownership health.' using errcode = '42501';
  end if;

  select
    count(*) filter (where coalesce(member.membership_status, member.status) in ('active', 'accepted'))::integer,
    count(*) filter (
      where coalesce(member.membership_status, member.status) in ('active', 'accepted')
        and lower(trim(coalesce(member.workspace_role, member.organisation_role, member.organization_role, member.role, ''))) = 'owner'
    )::integer,
    count(*) filter (where coalesce(member.is_primary_owner, false))::integer,
    count(*) filter (
      where coalesce(member.membership_status, member.status) in ('active', 'accepted')
        and coalesce(member.is_primary_owner, false)
    )::integer,
    count(*) filter (
      where coalesce(member.membership_status, member.status) in ('active', 'accepted')
        and coalesce(member.is_primary_owner, false)
        and lower(trim(coalesce(member.workspace_role, member.organisation_role, member.organization_role, member.role, ''))) = 'owner'
    )::integer,
    count(*) filter (
      where coalesce(member.membership_status, member.status) in ('active', 'accepted')
        and coalesce(member.is_primary_owner, false)
        and lower(trim(coalesce(member.workspace_role, member.organisation_role, member.organization_role, member.role, ''))) <> 'owner'
    )::integer
  into v_active_member_count, v_active_owner_count, v_all_primary_count,
    v_active_primary_count, v_active_primary_owner_count, v_invalid_primary_role_count
  from public.organisation_users member
  where member.organisation_id = p_organisation_id;

  if coalesce(v_active_owner_count, 0) = 0 then
    v_issues := array_append(v_issues, 'no_active_owner');
  end if;
  if coalesce(v_active_primary_count, 0) = 0 then
    v_issues := array_append(v_issues, case when coalesce(v_all_primary_count, 0) > 0 then 'primary_owner_is_not_active' else 'no_primary_owner' end);
  end if;
  if coalesce(v_active_primary_count, 0) > 1 then
    v_issues := array_append(v_issues, 'multiple_primary_owners');
  end if;
  if coalesce(v_invalid_primary_role_count, 0) > 0 then
    v_issues := array_append(v_issues, 'primary_owner_role_mismatch');
  end if;
  if coalesce(v_active_primary_owner_count, 0) <> 1 and not ('multiple_primary_owners' = any(v_issues)) then
    v_issues := array_append(v_issues, 'invalid_primary_owner');
  end if;

  return jsonb_build_object(
    'status', case when cardinality(v_issues) = 0 then 'healthy' else 'recovery_required' end,
    'issues', to_jsonb(v_issues),
    'activeMemberCount', coalesce(v_active_member_count, 0),
    'activeOwnerCount', coalesce(v_active_owner_count, 0),
    'activePrimaryCount', coalesce(v_active_primary_count, 0),
    'activePrimaryOwnerCount', coalesce(v_active_primary_owner_count, 0),
    'source', 'server_authoritative_phase5'
  );
end;
$$;

revoke all on function public.bridge_organisation_ownership_health(uuid) from public;
grant execute on function public.bridge_organisation_ownership_health(uuid) to authenticated;

commit;
