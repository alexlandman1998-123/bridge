alter table if exists public.organisation_users
  drop constraint if exists organisation_users_role_check;

alter table if exists public.organisation_users
  add constraint organisation_users_role_check
  check (role in (
    'super_admin',
    'owner',
    'principal',
    'director',
    'partner',
    'admin',
    'branch_manager',
    'team_lead',
    'manager',
    'sales_manager',
    'development_manager',
    'developer',
    'sales_agent',
    'agent',
    'senior_agent',
    'assistant',
    'transaction_coordinator',
    'listing_coordinator',
    'admin_coordinator',
    'attorney',
    'conveyancer',
    'consultant',
    'processor',
    'bond_originator',
    'admin_staff',
    'paralegal',
    'viewer'
  ));
