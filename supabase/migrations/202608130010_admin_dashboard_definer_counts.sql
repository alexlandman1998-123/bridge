begin;

alter function public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz)
  security definer;

comment on function public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz)
  is 'Admin portal dashboard contract with guarded platform-wide counts for organisations, agent-module users, listings, and transactions.';

commit;
