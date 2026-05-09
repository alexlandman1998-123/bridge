-- Align profiles.role with canonical app roles used by onboarding/profile bootstrap.

update public.profiles
set role = lower(trim(role))
where role is not null;

update public.profiles
set role = case
  when role in ('viewer', 'agent', 'developer', 'attorney', 'bond_originator', 'client') then role
  when role in ('buyer', 'seller') then 'client'
  when role in ('internal_admin', 'admin', 'super_admin', 'principal', 'branch_manager') then 'developer'
  when role in (
    'firm_admin',
    'lead_attorney',
    'paralegal',
    'admin_staff',
    'director_partner',
    'transfer_attorney',
    'bond_attorney',
    'conveyancing_secretary',
    'reception_scheduling',
    'candidate_attorney'
  ) then 'attorney'
  else 'viewer'
end;

update public.profiles
set role = 'viewer'
where role is null or trim(role) = '';

alter table public.profiles
  alter column role set default 'viewer';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('viewer', 'agent', 'developer', 'attorney', 'bond_originator', 'client'));
