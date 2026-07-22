begin;

create or replace view public.attorney_role_integrity_v1
with (security_invoker = true)
as
with assignment_slots as (
  select
    assignment.id as assignment_id,
    coalesce(assignment.attorney_firm_id, assignment.firm_id) as firm_id,
    slot.user_id,
    assignment.updated_at,
    public.bridge_attorney_member_assignment_eligible(
      coalesce(assignment.attorney_firm_id, assignment.firm_id),
      slot.user_id,
      coalesce(
        assignment.attorney_role,
        case lower(trim(coalesce(assignment.assignment_type, '')))
          when 'bond' then 'bond_attorney'
          when 'cancellation' then 'cancellation_attorney'
          else 'transfer_attorney'
        end
      ),
      slot.slot_name,
      slot.is_primary
    ) as eligible
  from public.transaction_attorney_assignments assignment
  cross join lateral (
    values
      ('attorney'::text, coalesce(assignment.attorney_user_id, assignment.primary_attorney_id), coalesce(assignment.is_primary, true)),
      ('secretary'::text, assignment.secretary_id, false),
      ('admin'::text, assignment.admin_handler_id, false)
  ) as slot(slot_name, user_id, is_primary)
  where coalesce(assignment.assignment_status, assignment.status, 'active') in ('pending', 'active', 'paused')
    and slot.user_id is not null
), assignment_health as (
  select
    firm_id,
    user_id,
    count(distinct assignment_id) as open_assignment_count,
    count(distinct assignment_id) filter (where not eligible) as ineligible_open_assignment_count,
    max(updated_at) as last_assignment_update
  from assignment_slots
  group by firm_id, user_id
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
  on assignment_health.firm_id = member.firm_id
 and assignment_health.user_id = member.user_id

union all

select
  null::uuid as member_id,
  assignment_health.firm_id,
  assignment_health.user_id,
  null::uuid as organisation_user_id,
  null::text as membership_status,
  null::text as professional_role,
  '{}'::text[] as practice_qualifications,
  null::text as compatibility_role,
  null::text as expected_compatibility_role,
  null::text as organisation_professional_role,
  '{}'::text[] as organisation_practice_qualifications,
  null::text as organisation_compatibility_role,
  null::uuid as organisation_attorney_member_id,
  assignment_health.open_assignment_count,
  assignment_health.ineligible_open_assignment_count,
  'ineligible_open_assignment'::text as integrity_status,
  assignment_health.last_assignment_update as last_integrity_update
from assignment_health
where assignment_health.ineligible_open_assignment_count > 0
  and not exists (
    select 1
    from public.attorney_firm_members member
    where member.firm_id = assignment_health.firm_id
      and member.user_id = assignment_health.user_id
      and member.status = 'active'
  );

revoke all on table public.attorney_role_integrity_v1 from public, anon, authenticated;
grant select on public.attorney_role_integrity_v1 to authenticated;

comment on view public.attorney_role_integrity_v1 is
  'Phase 8 read-only integrity gate for canonical attorney professional profiles, derived compatibility mirrors, organisation extensions, and open assignment eligibility.';

commit;
