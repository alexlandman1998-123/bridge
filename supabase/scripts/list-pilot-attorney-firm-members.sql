-- Read-only canonical attorney-firm membership candidates for the pilot.
select
  attorney_firms.name as firm_name,
  attorney_firm_members.user_id,
  attorney_firm_members.role,
  attorney_firm_members.status,
  profiles.full_name,
  profiles.email
from public.attorney_firms
join public.attorney_firm_members
  on attorney_firm_members.firm_id = attorney_firms.id
left join public.profiles
  on profiles.id = attorney_firm_members.user_id
where attorney_firms.is_active = true
  and attorney_firm_members.status = 'active'
order by attorney_firms.name, profiles.full_name nulls last, profiles.email nulls last;
