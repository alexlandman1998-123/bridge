create index if not exists telemetry_events_compatibility_fallback_lookup_idx
  on public.telemetry_events ((metadata ->> 'fallbackId'), created_at desc)
  where category = 'compatibility_fallback';

create or replace function public.bridge_compatibility_fallback_retirement_evidence(
  p_fallback_id text,
  p_window_minutes integer default 43200
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      nullif(btrim(p_fallback_id), '') as fallback_id,
      least(greatest(coalesce(p_window_minutes, 43200), 1440), 129600) as window_minutes
  ),
  scoped_events as (
    select event_name, created_at
    from public.telemetry_events, params
    where category = 'compatibility_fallback'
      and metadata ->> 'contract' = 'compatibility-fallback-telemetry-v1'
      and metadata ->> 'fallbackId' = params.fallback_id
      and created_at >= now() - make_interval(mins => params.window_minutes)
  ),
  totals as (
    select
      count(*)::integer as total_events,
      count(distinct created_at::date)::integer as active_days,
      count(*) filter (where event_name = 'compatibility_canonical_path_succeeded')::integer as canonical_success_count,
      count(*) filter (where event_name = 'compatibility_fallback_used')::integer as fallback_count,
      count(*) filter (where event_name = 'compatibility_fallback_failed')::integer as failure_count,
      min(created_at) as first_event_at,
      max(created_at) as last_event_at
    from scoped_events
  )
  select jsonb_build_object(
    'version', 'compatibility-fallback-evidence-v1',
    'fallbackId', params.fallback_id,
    'windowMinutes', params.window_minutes,
    'observedAt', now(),
    'totalEvents', totals.total_events,
    'activeDays', totals.active_days,
    'canonicalSuccessCount', totals.canonical_success_count,
    'fallbackCount', totals.fallback_count,
    'failureCount', totals.failure_count,
    'fallbackUnused', totals.fallback_count = 0 and totals.failure_count = 0,
    'firstEventAt', totals.first_event_at,
    'lastEventAt', totals.last_event_at
  )
  from params
  cross join totals;
$$;

revoke all on function public.bridge_compatibility_fallback_retirement_evidence(text, integer) from public;
revoke all on function public.bridge_compatibility_fallback_retirement_evidence(text, integer) from anon;
revoke all on function public.bridge_compatibility_fallback_retirement_evidence(text, integer) from authenticated;
grant execute on function public.bridge_compatibility_fallback_retirement_evidence(text, integer) to service_role;

comment on function public.bridge_compatibility_fallback_retirement_evidence(text, integer) is
  'Returns aggregate, non-PII telemetry evidence for manual compatibility-fallback retirement decisions. Service-role only; never disables a fallback automatically.';
