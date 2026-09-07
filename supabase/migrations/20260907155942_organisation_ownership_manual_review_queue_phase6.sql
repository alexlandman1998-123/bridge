begin;

-- Phase 6: detailed, read-only queue for ownership states that cannot be
-- safely repaired automatically. It exposes only to platform administrators.
create or replace function public.bridge_organisation_ownership_manual_review_queue()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue jsonb;
begin
  if not public.bridge_is_platform_admin() then
    raise exception 'Only platform administrators can inspect the ownership manual-review queue.' using errcode = '42501';
  end if;

  with active_memberships as (
    select
      ou.id,
      ou.organisation_id,
      ou.user_id,
      coalesce(nullif(trim(concat_ws(' ', ou.first_name, ou.last_name)), ''), ou.email, ou.user_id::text, ou.id::text) as member_name,
      coalesce(ou.membership_status, ou.status) as membership_status,
      coalesce(ou.is_primary_owner, false) as is_primary_owner,
      nullif(lower(trim(ou.role)), '') as role_value,
      nullif(lower(trim(ou.workspace_role)), '') as workspace_role_value,
      nullif(lower(trim(ou.organisation_role)), '') as organisation_role_value,
      nullif(lower(trim(ou.organization_role)), '') as organization_role_value
    from public.organisation_users ou
    where coalesce(ou.membership_status, ou.status) in ('active', 'accepted')
  ), members as (
    select
      m.*,
      coalesce(m.workspace_role_value, m.organisation_role_value, m.organization_role_value, m.role_value, 'viewer') as effective_role,
      cardinality(array_remove(array[m.role_value, m.workspace_role_value, m.organisation_role_value, m.organization_role_value], null)) as populated_role_field_count,
      (select count(distinct value) from unnest(array[m.role_value, m.workspace_role_value, m.organisation_role_value, m.organization_role_value]) as value where value is not null) as distinct_role_value_count
    from active_memberships m
  ), rollup as (
    select
      o.id as organisation_id,
      coalesce(nullif(o.display_name, ''), o.name, o.id::text) as organisation_name,
      count(m.id) as active_member_count,
      count(m.id) filter (where m.effective_role = 'owner') as active_owner_count,
      count(m.id) filter (where m.is_primary_owner) as active_primary_count,
      count(m.id) filter (where m.is_primary_owner and m.effective_role = 'owner') as active_primary_owner_count,
      count(m.id) filter (where m.is_primary_owner and m.effective_role <> 'owner') as invalid_primary_role_count
    from public.organisations o
    left join members m on m.organisation_id = o.id
    group by o.id, o.display_name, o.name
  ), reviewed as (
    select *, case
      when active_primary_count > 1 then 'manual_review_multiple_primary_owners'
      when active_owner_count = 0 then 'manual_review_no_active_owner'
      when invalid_primary_role_count > 0 then 'manual_review_primary_role_mismatch'
      when active_primary_count = 0 then 'manual_review_no_primary_owner'
      else null
    end as resolution
    from rollup
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'organisationId', r.organisation_id,
    'organisationName', r.organisation_name,
    'resolution', r.resolution,
    'activeMemberCount', r.active_member_count,
    'activeOwnerCount', r.active_owner_count,
    'activePrimaryCount', r.active_primary_count,
    'activePrimaryOwnerCount', r.active_primary_owner_count,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'membershipId', m.id,
        'userId', m.user_id,
        'memberName', m.member_name,
        'membershipStatus', m.membership_status,
        'effectiveRole', m.effective_role,
        'isPrimaryOwner', m.is_primary_owner,
        'roleFieldsComplete', m.populated_role_field_count = 4,
        'roleFieldsConsistent', m.distinct_role_value_count <= 1
      ) order by m.is_primary_owner desc, m.member_name)
      from members m where m.organisation_id = r.organisation_id
    ), '[]'::jsonb)
  ) order by r.organisation_name), '[]'::jsonb) into v_queue
  from reviewed r
  where r.resolution is not null;

  return v_queue;
end;
$$;

revoke all on function public.bridge_organisation_ownership_manual_review_queue() from public;
grant execute on function public.bridge_organisation_ownership_manual_review_queue() to authenticated;

commit;
