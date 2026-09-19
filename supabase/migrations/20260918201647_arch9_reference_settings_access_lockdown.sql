begin;

-- Reference counters are internal allocation state. They are mutated through
-- the existing privileged allocation functions and must not be exposed through
-- the Data API to anonymous or ordinary signed-in users.
alter table public.arch9_reference_settings enable row level security;

revoke all on table public.arch9_reference_settings from public;
revoke all on table public.arch9_reference_settings from anon;
revoke all on table public.arch9_reference_settings from authenticated;

comment on table public.arch9_reference_settings is
  'Internal Arch9 reference configuration and counters. Direct Data API access is denied; allocation occurs through privileged database routines.';

commit;
