-- Run after the Phase 1 and Phase 3 CEO dashboard migrations are deployed.

select
  to_regprocedure('public.arch9_admin_set_revenue_target_v1(date,bigint,text,text)') is not null as target_rpc_exists,
  has_function_privilege('authenticated', 'public.arch9_admin_set_revenue_target_v1(date,bigint,text,text)', 'execute') as authenticated_can_set_target,
  not has_function_privilege('anon', 'public.arch9_admin_set_revenue_target_v1(date,bigint,text,text)', 'execute') as anon_cannot_set_target;

select
  count(*) filter (where event_type = 'platform_revenue_target_updated') as target_audit_events,
  max(occurred_at) filter (where event_type = 'platform_revenue_target_updated') as latest_target_update
from public.platform_activity_events;

select
  month_start,
  target_amount_cents,
  currency,
  updated_at
from public.platform_revenue_targets
order by month_start desc
limit 12;
