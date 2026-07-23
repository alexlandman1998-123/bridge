-- Read-only candidate list for the two controlled-pilot agencies.
select
  organisations.name as organisation_name,
  organisation_users.user_id,
  organisation_users.role,
  organisation_users.status,
  profiles.full_name,
  profiles.email
from public.organisations
join public.organisation_users
  on organisation_users.organisation_id = organisations.id
left join public.profiles
  on profiles.id = organisation_users.user_id
where lower(organisations.name) like '%kingston%'
   or lower(organisations.name) like '%productive%'
order by organisations.name, profiles.full_name nulls last, profiles.email nulls last;
