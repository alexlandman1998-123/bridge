-- Platform administrators are global operators and are intentionally not
-- required to belong to an organisation workspace. Keep profiles.role aligned
-- with the canonical application role used by the authenticated bootstrap.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('viewer', 'agent', 'developer', 'attorney', 'bond_originator', 'client', 'platform_admin'));
