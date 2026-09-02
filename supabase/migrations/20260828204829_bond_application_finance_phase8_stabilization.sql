create or replace function public.bridge_bond_application_finance_stabilization(
  p_window_minutes integer default 10080
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select least(greatest(coalesce(p_window_minutes, 10080), 60), 43200) as window_minutes
  ),
  scoped_events as (
    select event_name, metadata, created_at
    from public.telemetry_events, params
    where category = 'bond_application_finance'
      and created_at >= now() - make_interval(mins => params.window_minutes)
  ),
  totals as (
    select
      count(*)::integer as total_events,
      count(distinct created_at::date)::integer as active_days,
      count(*) filter (
        where event_name = 'bond_application_finance_workspace_loaded'
          and coalesce(metadata ->> 'available', 'false') = 'true'
          and coalesce(metadata ->> 'valid', 'true') = 'true'
      )::integer as populated_workspace_event_count,
      count(*) filter (where event_name = 'bond_application_finance_fallback_active')::integer as fallback_count,
      count(*) filter (where event_name = 'bond_application_finance_refresh_failed')::integer as refresh_failure_count,
      count(*) filter (where event_name = 'bond_application_finance_identity_invalid')::integer as identity_invalid_count,
      min(created_at) as first_event_at,
      max(created_at) as last_event_at
    from scoped_events
  )
  select jsonb_build_object(
    'version', 'bond-application-finance-stabilization-v1',
    'windowMinutes', params.window_minutes,
    'observedAt', now(),
    'totalEvents', totals.total_events,
    'activeDays', totals.active_days,
    'populatedWorkspaceEventCount', totals.populated_workspace_event_count,
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
    'firstEventAt', totals.first_event_at,
    'lastEventAt', totals.last_event_at
  )
  from params
  cross join totals;
$$;

revoke all on function public.bridge_bond_application_finance_stabilization(integer) from public;
revoke all on function public.bridge_bond_application_finance_stabilization(integer) from anon;
revoke all on function public.bridge_bond_application_finance_stabilization(integer) from authenticated;
grant execute on function public.bridge_bond_application_finance_stabilization(integer) to service_role;

comment on function public.bridge_bond_application_finance_stabilization(integer) is
  'Returns aggregate, non-PII evidence for deciding whether the bond application Finance compatibility fallback may be retired. Service-role only; the observation window is clamped to 1 hour through 30 days.';
