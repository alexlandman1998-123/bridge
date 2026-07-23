-- Read-only candidate list for active attorney firms in the controlled pilot.
select
  organisations.name as organisation_name,
  organisation_users.user_id,
  coalesce(organisation_users.organization_role, organisation_users.role) as role,
  coalesce(organisation_users.membership_status, organisation_users.status) as membership_status,
  profiles.full_name,
  profiles.email
from public.organisations
join public.organisation_users
  on organisation_users.organisation_id = organisations.id
left join public.profiles
  on profiles.id = organisation_users.user_id
where organisations.organization_type = 'attorney_firm'
  and organisations.status = 'active'
  and coalesce(organisation_users.membership_status, organisation_users.status) = 'active'
order by organisations.name, profiles.full_name nulls last, profiles.email nulls last;
