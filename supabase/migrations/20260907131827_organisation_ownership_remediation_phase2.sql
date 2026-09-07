begin;

-- Phase 2 ownership remediation
--
-- Historical data is deliberately not mutated when this migration is applied.
-- A platform administrator must review the dry-run output and explicitly set
-- p_apply = true. Only the unambiguous case is eligible for automatic repair:
-- no active owner, exactly one active primary membership, and that membership
-- is an active principal. All other states remain manual-review cases.
create or replace function public.bridge_organisation_ownership_remediation_report(
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
    raise exception 'Only platform administrators can inspect ownership remediation candidates.' using errcode = '42501';
  end if;

  with scoped_organisations as (
    select o.id, coalesce(nullif(o.display_name, ''), o.name, o.id::text) as name
    from public.organisations o
    where p_organisation_id is null or o.id = p_organisation_id
  ), membership_rollup as (
    select
      o.id as organisation_id,
      o.name as organisation_name,
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
          and lower(trim(coalesce(ou.workspace_role, ou.organisation_role, ou.organization_role, ou.role, ''))) = 'principal'
      ) as active_primary_principal_count,
      count(ou.id) filter (
        where coalesce(ou.membership_status, ou.status) = 'active'
          and coalesce(ou.is_primary_owner, false)
          and lower(trim(coalesce(ou.workspace_role, ou.organisation_role, ou.organization_role, ou.role, ''))) <> 'owner'
      ) as invalid_primary_role_count,
      min(ou.id::text) filter (
        where coalesce(ou.membership_status, ou.status) = 'active'
          and coalesce(ou.is_primary_owner, false)
      ) as primary_membership_id
    from scoped_organisations o
    left join public.organisation_users ou on ou.organisation_id = o.id
    group by o.id, o.name
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'organisationId', organisation_id,
        'organisationName', organisation_name,
        'activeMemberCount', active_member_count,
        'activeOwnerCount', active_owner_count,
        'activePrimaryCount', active_primary_count,
        'invalidPrimaryRoleCount', invalid_primary_role_count,
        'primaryMembershipId', primary_membership_id,
        'resolution', case
          when active_owner_count = 0
            and active_primary_count = 1
            and active_primary_principal_count = 1
            then 'safe_repair'
          when active_primary_count > 1 then 'manual_review_multiple_primary_owners'
          when active_owner_count = 0 then 'manual_review_no_active_owner'
          when invalid_primary_role_count > 0 then 'manual_review_primary_role_mismatch'
          else 'ready'
        end
      ) order by organisation_name
    ),
    '[]'::jsonb
  ) into v_report
  from membership_rollup;

  return v_report;
end;
$$;

create or replace function public.bridge_apply_safe_organisation_ownership_remediation(
  p_organisation_id uuid default null,
  p_apply boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate record;
  v_candidates jsonb := '[]'::jsonb;
  v_repaired jsonb := '[]'::jsonb;
begin
  if not public.bridge_is_platform_admin() then
    raise exception 'Only platform administrators can remediate organisation ownership.' using errcode = '42501';
  end if;

  for v_candidate in
    with membership_rollup as (
      select
        ou.organisation_id,
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
            and lower(trim(coalesce(ou.workspace_role, ou.organisation_role, ou.organization_role, ou.role, ''))) = 'principal'
        ) as active_primary_principal_count
      from public.organisation_users ou
      where p_organisation_id is null or ou.organisation_id = p_organisation_id
      group by ou.organisation_id
    )
    select ou.id as membership_id, ou.organisation_id, ou.user_id
    from membership_rollup r
    join public.organisation_users ou on ou.organisation_id = r.organisation_id
    where r.active_owner_count = 0
      and r.active_primary_count = 1
      and r.active_primary_principal_count = 1
      and coalesce(ou.membership_status, ou.status) = 'active'
      and coalesce(ou.is_primary_owner, false)
      and lower(trim(coalesce(ou.workspace_role, ou.organisation_role, ou.organization_role, ou.role, ''))) = 'principal'
    order by ou.organisation_id
  loop
    v_candidates := v_candidates || jsonb_build_array(jsonb_build_object(
      'organisationId', v_candidate.organisation_id,
      'membershipId', v_candidate.membership_id
    ));

    if not p_apply then
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(v_candidate.organisation_id::text, 0));
    perform set_config('bridge.ownership_transfer', 'on', true);

    update public.organisation_users
    set role = 'owner',
        workspace_role = 'owner',
        organisation_role = 'owner',
        organization_role = 'owner',
        job_title = coalesce(nullif(job_title, ''), 'organisation_owner'),
        updated_at = now()
    where id = v_candidate.membership_id
      and organisation_id = v_candidate.organisation_id
      and coalesce(membership_status, status) = 'active'
      and coalesce(is_primary_owner, false)
      and lower(trim(coalesce(workspace_role, organisation_role, organization_role, role, ''))) = 'principal'
      and not exists (
        select 1
        from public.organisation_users existing
        where existing.organisation_id = v_candidate.organisation_id
          and existing.id <> v_candidate.membership_id
          and coalesce(existing.membership_status, existing.status) = 'active'
          and (
            coalesce(existing.is_primary_owner, false)
            or lower(trim(coalesce(existing.workspace_role, existing.organisation_role, existing.organization_role, existing.role, ''))) = 'owner'
          )
      );

    if not found then
      raise exception 'Ownership remediation changed concurrently for organisation %.', v_candidate.organisation_id using errcode = '40001';
    end if;

    insert into public.organization_events (
      organization_id, actor_user_id, target_user_id, event_type, event_data
    ) values (
      v_candidate.organisation_id,
      auth.uid(),
      v_candidate.user_id,
      'organisation_ownership_remediated_phase2',
      jsonb_build_object(
        'membershipId', v_candidate.membership_id,
        'previousRole', 'principal',
        'nextRole', 'owner',
        'mode', 'safe_automatic_repair'
      )
    );

    v_repaired := v_repaired || jsonb_build_array(jsonb_build_object(
      'organisationId', v_candidate.organisation_id,
      'membershipId', v_candidate.membership_id
    ));
  end loop;

  return jsonb_build_object(
    'applied', p_apply,
    'candidates', v_candidates,
    'repaired', v_repaired,
    'report', public.bridge_organisation_ownership_remediation_report(p_organisation_id)
  );
end;
$$;

revoke all on function public.bridge_organisation_ownership_remediation_report(uuid) from public;
grant execute on function public.bridge_organisation_ownership_remediation_report(uuid) to authenticated;
revoke all on function public.bridge_apply_safe_organisation_ownership_remediation(uuid, boolean) from public;
grant execute on function public.bridge_apply_safe_organisation_ownership_remediation(uuid, boolean) to authenticated;

commit;
