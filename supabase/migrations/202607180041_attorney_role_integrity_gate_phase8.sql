begin;

create or replace view public.attorney_role_integrity_v1
with (security_invoker = true)
as
with assignment_health as (
  select
    member.id as member_id,
    count(assignment.id) filter (
      where coalesce(assignment.assignment_status, assignment.status, 'active') in ('pending', 'active', 'paused')
    ) as open_assignment_count,
    count(assignment.id) filter (
      where coalesce(assignment.assignment_status, assignment.status, 'active') in ('pending', 'active', 'paused')
        and not (
          (
            coalesce(assignment.attorney_user_id, assignment.primary_attorney_id) is distinct from member.user_id
            or (
              member.professional_role in ('firm_admin', 'director_partner')
              or (coalesce(assignment.is_primary, true) = false and member.professional_role = 'candidate_attorney')
              or (
                member.professional_role = 'attorney_conveyancer'
                and case coalesce(assignment.attorney_role, assignment.assignment_type)
                  when 'bond_attorney' then 'bond' = any(member.practice_qualifications)
                  when 'bond' then 'bond' = any(member.practice_qualifications)
                  when 'cancellation_attorney' then 'cancellation' = any(member.practice_qualifications)
                  when 'cancellation' then 'cancellation' = any(member.practice_qualifications)
                  else 'transfer' = any(member.practice_qualifications)
                end
              )
            )
          )
          and (
            assignment.secretary_id is distinct from member.user_id
            or
              member.professional_role in ('conveyancing_secretary', 'admin_staff', 'candidate_attorney')
          )
          and (
            assignment.admin_handler_id is distinct from member.user_id
            or
              member.professional_role in ('admin_staff', 'conveyancing_secretary', 'candidate_attorney')
          )
        )
    ) as ineligible_open_assignment_count
  from public.attorney_firm_members member
  left join public.transaction_attorney_assignments assignment
    on coalesce(assignment.attorney_firm_id, assignment.firm_id) = member.firm_id
   and member.user_id in (
     coalesce(assignment.attorney_user_id, assignment.primary_attorney_id),
     assignment.secretary_id,
     assignment.admin_handler_id
   )
  group by member.id
)
select
  member.id as member_id,
  member.firm_id,
  member.user_id,
  member.organisation_user_id,
  member.status as membership_status,
  member.professional_role,
  member.practice_qualifications,
  member.role as compatibility_role,
  public.bridge_attorney_professional_to_compatibility_role(
    member.professional_role,
    member.practice_qualifications
  ) as expected_compatibility_role,
  organisation_user.attorney_professional_role as organisation_professional_role,
  coalesce(organisation_user.attorney_practice_qualifications, '{}'::text[]) as organisation_practice_qualifications,
  organisation_user.attorney_compatibility_role as organisation_compatibility_role,
  organisation_user.attorney_firm_member_id as organisation_attorney_member_id,
  coalesce(assignment_health.open_assignment_count, 0) as open_assignment_count,
  coalesce(assignment_health.ineligible_open_assignment_count, 0) as ineligible_open_assignment_count,
  case
    when coalesce(assignment_health.ineligible_open_assignment_count, 0) > 0 then 'ineligible_open_assignment'
    when member.role is distinct from public.bridge_attorney_professional_to_compatibility_role(
      member.professional_role,
      member.practice_qualifications
    ) then 'compatibility_mismatch'
    when member.organisation_user_id is null or organisation_user.id is null then 'missing_organisation_extension'
    when organisation_user.attorney_professional_role is distinct from member.professional_role
      or coalesce(organisation_user.attorney_practice_qualifications, '{}'::text[]) is distinct from member.practice_qualifications
      or organisation_user.attorney_compatibility_role is distinct from member.role
      or organisation_user.attorney_firm_member_id is distinct from member.id
      then 'organisation_extension_mismatch'
    else 'healthy'
  end as integrity_status,
  greatest(
    member.updated_at,
    coalesce(organisation_user.updated_at, member.updated_at)
  ) as last_integrity_update
from public.attorney_firm_members member
left join public.organisation_users organisation_user
  on organisation_user.id = member.organisation_user_id
left join assignment_health
  on assignment_health.member_id = member.id;

grant select on public.attorney_role_integrity_v1 to authenticated;

comment on view public.attorney_role_integrity_v1 is
  'Phase 8 read-only integrity gate for canonical attorney professional profiles, derived compatibility mirrors, organisation extensions, and open assignment eligibility.';

commit;
