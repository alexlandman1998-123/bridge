begin;

create or replace function public.bridge_notification_release_readiness_phase10(
  p_organisation_id uuid default null,
  p_since timestamptz default now() - interval '7 days'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz := coalesce(p_since, now() - interval '7 days');
  v_active_definitions integer := 0;
  v_planned_definitions integer := 0;
  v_disabled_definitions integer := 0;
  v_recent_events integer := 0;
  v_recent_failures integer := 0;
  v_recent_attempt_failures integer := 0;
  v_recent_suppressed integer := 0;
  v_recent_deferred integer := 0;
  v_active_suppressions integer := 0;
  v_pending_queue integer := 0;
  v_stale_queue integer := 0;
  v_missing_branding integer := 0;
  v_status text := 'ready';
  v_blockers jsonb := '[]'::jsonb;
begin
  if p_organisation_id is null and auth.role() <> 'service_role' then
    return jsonb_build_object(
      'status', 'forbidden',
      'generatedAt', now(),
      'message', 'An organisationId is required for authenticated notification release readiness checks.'
    );
  end if;

  if p_organisation_id is not null
     and auth.role() <> 'service_role'
     and not public.bridge_is_active_member(p_organisation_id) then
    return jsonb_build_object(
      'status', 'forbidden',
      'organisationId', p_organisation_id,
      'generatedAt', now()
    );
  end if;

  select
    count(*) filter (where implementation_status = 'active')::integer,
    count(*) filter (where implementation_status = 'planned')::integer,
    count(*) filter (where implementation_status = 'disabled')::integer
    into v_active_definitions, v_planned_definitions, v_disabled_definitions
  from public.notification_automation_definitions;

  select
    count(*)::integer,
    count(*) filter (where status = 'failed')::integer,
    count(*) filter (where status = 'queued')::integer,
    count(*) filter (
      where status = 'queued'
        and coalesce(next_dispatch_attempt_at, queued_at, created_at) < now() - interval '30 minutes'
    )::integer
    into v_recent_events, v_recent_failures, v_pending_queue, v_stale_queue
  from public.notification_events event
  where event.created_at >= v_since
    and (p_organisation_id is null or event.organisation_id = p_organisation_id);

  select
    count(*) filter (where status = 'failed')::integer,
    count(*) filter (where status = 'suppressed')::integer,
    count(*) filter (where status = 'deferred')::integer
    into v_recent_attempt_failures, v_recent_suppressed, v_recent_deferred
  from public.notification_delivery_attempts attempt
  where attempt.attempted_at >= v_since
    and (p_organisation_id is null or attempt.organisation_id = p_organisation_id);

  select count(*)::integer
    into v_active_suppressions
  from public.notification_suppression_list suppression
  where suppression.active
    and (suppression.expires_at is null or suppression.expires_at > now())
    and (p_organisation_id is null or suppression.organisation_id = p_organisation_id);

  if to_regclass('public.organisation_email_branding_readiness') is not null then
    select count(*)::integer
      into v_missing_branding
    from public.organisation_email_branding_readiness readiness
    where readiness.email_branding_ready is false
      and (p_organisation_id is null or readiness.organisation_id = p_organisation_id);
  end if;

  if v_active_definitions = 0 then
    v_status := 'blocked';
    v_blockers := v_blockers || jsonb_build_array('no_active_notification_definitions');
  end if;

  if v_recent_failures > 0 or v_recent_attempt_failures > 0 then
    v_status := 'blocked';
    v_blockers := v_blockers || jsonb_build_array('recent_notification_failures');
  end if;

  if v_stale_queue > 0 then
    v_status := 'blocked';
    v_blockers := v_blockers || jsonb_build_array('stale_queued_notifications');
  end if;

  if v_missing_branding > 0 then
    v_status := case when v_status = 'blocked' then 'blocked' else 'warning' end;
    v_blockers := v_blockers || jsonb_build_array('organisations_missing_email_branding');
  end if;

  return jsonb_build_object(
    'status', v_status,
    'organisationId', p_organisation_id,
    'since', v_since,
    'generatedAt', now(),
    'blockers', v_blockers,
    'checks', jsonb_build_object(
      'activeDefinitions', v_active_definitions,
      'plannedDefinitions', v_planned_definitions,
      'disabledDefinitions', v_disabled_definitions,
      'recentEvents', v_recent_events,
      'recentEventFailures', v_recent_failures,
      'recentAttemptFailures', v_recent_attempt_failures,
      'recentSuppressedAttempts', v_recent_suppressed,
      'recentDeferredAttempts', v_recent_deferred,
      'activeSuppressions', v_active_suppressions,
      'pendingQueue', v_pending_queue,
      'staleQueue', v_stale_queue,
      'organisationsMissingEmailBranding', v_missing_branding
    ),
    'releaseGate', jsonb_build_object(
      'requiresRegressionSuite', true,
      'requiresDenoCheck', true,
      'requiresBrandedTemplateTests', true,
      'requiresPhaseScripts', true,
      'requiresQueueControls', true,
      'requiresObservabilitySnapshot', true,
      'requiresPilotOrganisationCanary', true
    )
  );
end;
$$;

grant execute on function public.bridge_notification_release_readiness_phase10(uuid, timestamptz)
  to authenticated, service_role;

comment on function public.bridge_notification_release_readiness_phase10(uuid, timestamptz) is
  'Phase 10 release gate for the notification rollout. Reports active definitions, recent failures, queue health, suppressions, branding gaps, and required regression checks.';

commit;
