begin;

-- Phase 7 ownership rollout gate
--
-- Phase 1 prevents new invalid primary-owner writes and Phase 2/6 provides
-- controlled remediation. This read-only gate is the required production
-- preflight before introducing a physical unique-primary index in a later,
-- separately approved migration. It never changes organisation data.
create or replace function public.bridge_organisation_ownership_release_readiness()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_blockers jsonb;
  v_total integer;
begin
  if not public.bridge_is_platform_admin() then
    raise exception 'Only platform administrators can inspect ownership release readiness.' using errcode = '42501';
  end if;

  with membership_rollup as (
    select
      o.id as organisation_id,
      coalesce(nullif(o.display_name, ''), o.name, o.id::text) as organisation_name,
      count(ou.id) filter (
        where coalesce(ou.membership_status, ou.status) = 'active'
      ) as active_member_count,
      count(ou.id) filter (
        where coalesce(ou.membership_status, ou.status) = 'active'
          and lower(trim(coalesce(ou.workspace_role, ou.organisation_role, ou.organization_role, ou.role, ''))) = 'owner'
      ) as active_owner_count,
      count(ou.id) filter (
        where coalesce(ou.membership_status, ou.status) = 'active'
          and coalesce(ou.is_primary_owner, false)
      ) as active_primary_count,
      count(ou.id) filter (
        where coalesce(ou.membership_status, ou.status) = 'active'
          and coalesce(ou.is_primary_owner, false)
          and lower(trim(coalesce(ou.workspace_role, ou.organisation_role, ou.organization_role, ou.role, ''))) <> 'owner'
      ) as invalid_primary_role_count
    from public.organisations o
    left join public.organisation_users ou on ou.organisation_id = o.id
    group by o.id, o.display_name, o.name
  ), readiness as (
    select *,
      case
        when active_owner_count = 0 then 'no_active_owner'
        when active_primary_count = 0 then 'no_active_primary_owner'
        when active_primary_count > 1 then 'multiple_active_primary_owners'
        when invalid_primary_role_count > 0 then 'primary_owner_role_mismatch'
        else null
      end as blocker
    from membership_rollup
  )
  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'organisationId', organisation_id,
          'organisationName', organisation_name,
          'blocker', blocker,
          'activeMemberCount', active_member_count,
          'activeOwnerCount', active_owner_count,
          'activePrimaryCount', active_primary_count,
          'invalidPrimaryRoleCount', invalid_primary_role_count
        ) order by organisation_name
      ) filter (where blocker is not null),
      '[]'::jsonb
    )
  into v_total, v_blockers
  from readiness;

  return jsonb_build_object(
    'status', case
      when jsonb_array_length(v_blockers) = 0 then 'ready_for_unique_primary_enforcement'
      else 'remediation_required'
    end,
    'organisationCount', coalesce(v_total, 0),
    'blockerCount', jsonb_array_length(v_blockers),
    'blockers', v_blockers,
    'nextStep', case
      when jsonb_array_length(v_blockers) = 0 then 'A platform administrator may approve the separate unique-primary enforcement migration.'
      else 'Resolve every blocker through the ownership remediation queue, then rerun this read-only release gate.'
    end
  );
end;
$$;

revoke all on function public.bridge_organisation_ownership_release_readiness() from public;
grant execute on function public.bridge_organisation_ownership_release_readiness() to authenticated;

commit;
