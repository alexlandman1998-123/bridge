create or replace function public.bridge_bond_application_finance_monitor(
  p_window_minutes integer default 60
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select least(greatest(coalesce(p_window_minutes, 60), 5), 10080) as window_minutes
  ),
  scoped_events as (
    select event_name, created_at
    from public.telemetry_events, params
    where category = 'bond_application_finance'
      and created_at >= now() - make_interval(mins => params.window_minutes)
  ),
  totals as (
    select
      count(*)::integer as total_events,
      count(*) filter (where event_name = 'bond_application_finance_workspace_loaded')::integer as workspace_loaded_count,
      count(*) filter (where event_name = 'bond_application_finance_fallback_active')::integer as fallback_count,
      count(*) filter (where event_name = 'bond_application_finance_refresh_failed')::integer as refresh_failure_count,
      count(*) filter (where event_name = 'bond_application_finance_identity_invalid')::integer as identity_invalid_count,
      max(created_at) as last_event_at
    from scoped_events
  )
  select jsonb_build_object(
    'version', 'bond-application-finance-monitor-v1',
    'windowMinutes', params.window_minutes,
    'observedAt', now(),
    'totalEvents', totals.total_events,
    'workspaceLoadedCount', totals.workspace_loaded_count,
    'fallbackCount', totals.fallback_count,
    'refreshFailureCount', totals.refresh_failure_count,
    'identityInvalidCount', totals.identity_invalid_count,
    'fallbackRate', case
      when totals.total_events = 0 then 0
      else round(totals.fallback_count::numeric / totals.total_events::numeric, 4)
    end,
    'refreshFailureRate', case
      when totals.total_events = 0 then 0
      else round(totals.refresh_failure_count::numeric / totals.total_events::numeric, 4)
    end,
    'lastEventAt', totals.last_event_at
  )
  from params
  cross join totals;
$$;

revoke all on function public.bridge_bond_application_finance_monitor(integer) from public;
revoke all on function public.bridge_bond_application_finance_monitor(integer) from anon;
revoke all on function public.bridge_bond_application_finance_monitor(integer) from authenticated;
grant execute on function public.bridge_bond_application_finance_monitor(integer) to service_role;

comment on function public.bridge_bond_application_finance_monitor(integer) is
  'Returns a non-PII operational summary of bond application Finance workspace telemetry. Service-role monitoring only; the window is clamped to 5 minutes through 7 days.';
