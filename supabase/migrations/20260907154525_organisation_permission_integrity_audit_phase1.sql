begin;

-- Phase 1 permission-integrity audit
--
-- This is intentionally read-only.  It gives platform administrators a
-- consistent, permission-safe inventory of role-field drift left by legacy
-- onboarding and imports before any bulk remediation is considered.
create or replace function public.bridge_organisation_permission_integrity_report(
  p_organisation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report jsonb;
begin
  if not public.bridge_is_platform_admin() then
    raise exception 'Only platform administrators can inspect the organisation permission-integrity audit.' using errcode = '42501';
  end if;

  with scoped_organisations as (
    select o.id, coalesce(nullif(o.display_name, ''), o.name, o.id::text) as name
    from public.organisations o
    where p_organisation_id is null or o.id = p_organisation_id
  ), active_memberships as (
    select
      ou.id,
      ou.organisation_id,
      ou.user_id,
      coalesce(ou.is_primary_owner, false) as is_primary_owner,
      nullif(lower(trim(ou.role)), '') as role_value,
      nullif(lower(trim(ou.workspace_role)), '') as workspace_role_value,
      nullif(lower(trim(ou.organisation_role)), '') as organisation_role_value,
      nullif(lower(trim(ou.organization_role)), '') as organization_role_value
    from public.organisation_users ou
    join scoped_organisations o on o.id = ou.organisation_id
    where coalesce(ou.membership_status, ou.status) = 'active'
  ), membership_integrity as (
    select
      m.*,
      cardinality(array_remove(array[
        m.role_value,
        m.workspace_role_value,
        m.organisation_role_value,
        m.organization_role_value
      ], null)) as populated_role_field_count,
      (select count(distinct value)
       from unnest(array[
         m.role_value,
         m.workspace_role_value,
         m.organisation_role_value,
         m.organization_role_value
       ]) as value
       where value is not null) as distinct_role_value_count,
      coalesce(m.workspace_role_value, m.organisation_role_value, m.organization_role_value, m.role_value) as effective_role
    from active_memberships m
  ), duplicate_active_memberships as (
    select organisation_id, user_id, count(*) as membership_count
    from active_memberships
    where user_id is not null
    group by organisation_id, user_id
    having count(*) > 1
  ), organisation_rollup as (
    select
      o.id as organisation_id,
      o.name as organisation_name,
      count(mi.id) as active_member_count,
      count(mi.id) filter (where mi.populated_role_field_count < 4) as role_field_incomplete_count,
      count(mi.id) filter (where mi.distinct_role_value_count > 1) as role_field_conflict_count,
      count(mi.id) filter (where mi.is_primary_owner and mi.effective_role is distinct from 'owner') as invalid_primary_owner_count,
      (
        select count(*) from duplicate_active_memberships d
        where d.organisation_id = o.id
      ) as duplicate_active_membership_group_count
    from scoped_organisations o
    left join membership_integrity mi on mi.organisation_id = o.id
    group by o.id, o.name
  ), organisation_details as (
    select
      r.*,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'membershipId', mi.id,
          'userId', mi.user_id,
          'role', mi.role_value,
          'workspaceRole', mi.workspace_role_value,
          'organisationRole', mi.organisation_role_value,
          'organizationRole', mi.organization_role_value,
          'effectiveRole', mi.effective_role,
          'isPrimaryOwner', mi.is_primary_owner,
          'issues', array_remove(array[
            case when mi.populated_role_field_count < 4 then 'role_fields_incomplete' end,
            case when mi.distinct_role_value_count > 1 then 'role_fields_conflict' end,
            case when mi.is_primary_owner and mi.effective_role is distinct from 'owner' then 'primary_owner_role_mismatch' end
          ], null)
        ) order by mi.id)
        from membership_integrity mi
        where mi.organisation_id = r.organisation_id
          and (
            mi.populated_role_field_count < 4
            or mi.distinct_role_value_count > 1
            or (mi.is_primary_owner and mi.effective_role is distinct from 'owner')
          )
      ), '[]'::jsonb) as role_findings,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'userId', d.user_id,
          'activeMembershipCount', d.membership_count
        ) order by d.user_id)
        from duplicate_active_memberships d
        where d.organisation_id = r.organisation_id
      ), '[]'::jsonb) as duplicate_membership_findings
    from organisation_rollup r
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'organisations', coalesce(jsonb_agg(jsonb_build_object(
      'organisationId', organisation_id,
      'organisationName', organisation_name,
      'activeMemberCount', active_member_count,
      'roleFieldIncompleteCount', role_field_incomplete_count,
      'roleFieldConflictCount', role_field_conflict_count,
      'invalidPrimaryOwnerCount', invalid_primary_owner_count,
      'duplicateActiveMembershipGroupCount', duplicate_active_membership_group_count,
      'roleFindings', role_findings,
      'duplicateMembershipFindings', duplicate_membership_findings
    ) order by organisation_name), '[]'::jsonb),
    'summary', jsonb_build_object(
      'organisationCount', count(*),
      'roleFieldIncompleteCount', coalesce(sum(role_field_incomplete_count), 0),
      'roleFieldConflictCount', coalesce(sum(role_field_conflict_count), 0),
      'invalidPrimaryOwnerCount', coalesce(sum(invalid_primary_owner_count), 0),
      'duplicateActiveMembershipGroupCount', coalesce(sum(duplicate_active_membership_group_count), 0)
    )
  ) into v_report
  from organisation_details;

  return v_report;
end;
$$;

revoke all on function public.bridge_organisation_permission_integrity_report(uuid) from public;
grant execute on function public.bridge_organisation_permission_integrity_report(uuid) to authenticated;

commit;
