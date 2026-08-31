-- Phase 81: read-only observation for a deliberately limited Rentals pilot.
-- This function does not mutate release controls, pilot decisions, or any
-- operational record, and does not cross into Sales.
create or replace function public.rental_get_pilot_execution_monitor(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_gate jsonb;
  v_latest_decision jsonb;
  v_metrics jsonb;
  v_alerts jsonb;
begin
  if auth.uid() is null or not public.rental_financial_manager_authorized(p_org) then
    raise exception 'Not authorized';
  end if;

  v_gate := public.rental_get_pilot_launch_gate(p_org);

  select to_jsonb(decision) into v_latest_decision
  from (
    select id, decision, cohort_label, max_active_tenancies, created_at
    from public.rental_pilot_release_decisions
    where organisation_id = p_org
    order by created_at desc
    limit 1
  ) decision;

  select jsonb_build_object(
    'active_tenancies', (select count(*) from public.rental_tenancies where organisation_id = p_org and status in ('active', 'notice_given', 'move_out_pending')),
    'applications_to_review', (select count(*) from public.rental_applications where organisation_id = p_org and status in ('submitted', 'under_review')),
    'urgent_maintenance', (select count(*) from public.rental_maintenance_requests where organisation_id = p_org and status not in ('resolved', 'cancelled') and priority in ('emergency', 'urgent')),
    'screening_in_progress', (select count(*) from public.rental_screening_cases where organisation_id = p_org and status in ('in_review', 'evidence_requested'))
  ) into v_metrics;

  select coalesce(jsonb_agg(alert order by alert ->> 'severity', alert ->> 'key'), '[]'::jsonb)
  into v_alerts
  from (
    select jsonb_build_object('key', 'pilot_gate', 'severity', 'blocked', 'title', 'Pilot guardrail is not currently eligible', 'affected_count', coalesce(jsonb_array_length(v_gate -> 'missing_pilot_controls'), 0)) as alert
    where not coalesce((v_gate ->> 'eligible')::boolean, false)
    union all
    select jsonb_build_object('key', 'tenancy_cap', 'severity', 'blocked', 'title', 'Active tenancies exceed the recorded pilot cap', 'affected_count', (v_metrics ->> 'active_tenancies')::integer)
    where not coalesce((v_gate ->> 'within_tenancy_cap')::boolean, false)
    union all
    select jsonb_build_object('key', 'urgent_maintenance', 'severity', 'urgent', 'title', 'Urgent maintenance needs attention during pilot', 'affected_count', (v_metrics ->> 'urgent_maintenance')::integer)
    where coalesce((v_metrics ->> 'urgent_maintenance')::integer, 0) > 0
    union all
    select jsonb_build_object('key', 'applications', 'severity', 'action', 'title', 'Applications awaiting review', 'affected_count', (v_metrics ->> 'applications_to_review')::integer)
    where coalesce((v_metrics ->> 'applications_to_review')::integer, 0) > 0
    union all
    select jsonb_build_object('key', 'screening', 'severity', 'action', 'title', 'Screening cases still in progress', 'affected_count', (v_metrics ->> 'screening_in_progress')::integer)
    where coalesce((v_metrics ->> 'screening_in_progress')::integer, 0) > 0
  ) alerts;

  return jsonb_build_object(
    'version', 'arch9_rental_pilot_execution_monitor_v1',
    'as_of', now(),
    'latest_decision', v_latest_decision,
    'gate', v_gate,
    'metrics', v_metrics,
    'alerts', v_alerts,
    'guardrail', 'Read-only pilot observation. This neither activates a feature nor changes a decision, pilot control, listing, message, portal, financial record, or Sales workflow.'
  );
end;
$$;

revoke all on function public.rental_get_pilot_execution_monitor(uuid) from public, anon;
grant execute on function public.rental_get_pilot_execution_monitor(uuid) to authenticated;
