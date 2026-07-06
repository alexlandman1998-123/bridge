begin;

update public.notification_automation_definitions
   set metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
         jsonb_build_object('phase', 'phase_5_observability'),
       updated_at = now()
 where automation_key in (
   'buyer_onboarding_sent',
   'seller_onboarding_sent',
   'buyer_portal_sent',
   'seller_portal_sent',
   'attorney_invite_sent',
   'bond_originator_invite_sent',
   'agent_invite_sent',
   'buyer_onboarding_submitted',
   'seller_onboarding_submitted',
   'attorney_invite_accepted',
   'bond_originator_invite_accepted',
   'agent_invite_accepted',
   'buyer_onboarding_reminder',
   'seller_onboarding_reminder',
   'attorney_invite_reminder',
   'bond_originator_invite_reminder',
   'agent_invite_reminder'
 );

create or replace function public.bridge_notification_automation_health_phase5(
  p_organisation_id uuid default null,
  p_since timestamptz default now() - interval '30 days'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz := coalesce(p_since, now() - interval '30 days');
  v_status text := 'healthy';
  v_totals jsonb := '{}'::jsonb;
  v_counts_by_status jsonb := '{}'::jsonb;
  v_counts_by_category jsonb := '{}'::jsonb;
  v_counts_by_automation jsonb := '{}'::jsonb;
  v_recent_events jsonb := '[]'::jsonb;
  v_recent_failures jsonb := '[]'::jsonb;
  v_recent_runs jsonb := '[]'::jsonb;
  v_issues jsonb := '[]'::jsonb;
  v_active_definitions integer := 0;
  v_planned_definitions integer := 0;
  v_disabled_definitions integer := 0;
  v_total_events integer := 0;
  v_sent_events integer := 0;
  v_failed_events integer := 0;
  v_queued_reminders integer := 0;
  v_processing_reminders integer := 0;
  v_stale_processing_reminders integer := 0;
  v_failed_reminders integer := 0;
  v_last_event_at timestamptz;
  v_last_dispatch_at timestamptz;
begin
  if p_organisation_id is not null and not public.bridge_is_active_member(p_organisation_id) then
    return jsonb_build_object(
      'status', 'forbidden',
      'generatedAt', now(),
      'organisationId', p_organisation_id,
      'message', 'Current user is not an active member of the requested organisation.'
    );
  end if;

  select
    count(*) filter (where implementation_status = 'active')::integer,
    count(*) filter (where implementation_status = 'planned')::integer,
    count(*) filter (where implementation_status = 'disabled')::integer
    into v_active_definitions, v_planned_definitions, v_disabled_definitions
  from public.notification_automation_definitions;

  with accessible_events as (
    select *
    from public.notification_events event
    where event.created_at >= v_since
      and (p_organisation_id is null or event.organisation_id = p_organisation_id)
      and public.bridge_is_active_member(event.organisation_id)
  )
  select
    count(*)::integer,
    count(*) filter (where status in ('sent', 'delivered'))::integer,
    count(*) filter (where status = 'failed')::integer,
    count(*) filter (
      where category = 'reminder'
        and trigger_type = 'scheduled_reminder'
        and channel = 'email'
        and status = 'queued'
    )::integer,
    count(*) filter (
      where category = 'reminder'
        and trigger_type = 'scheduled_reminder'
        and channel = 'email'
        and status = 'processing'
    )::integer,
    count(*) filter (
      where category = 'reminder'
        and trigger_type = 'scheduled_reminder'
        and channel = 'email'
        and status = 'processing'
        and coalesce(last_dispatch_attempt_at, created_at) < now() - interval '15 minutes'
    )::integer,
    count(*) filter (
      where category = 'reminder'
        and trigger_type = 'scheduled_reminder'
        and channel = 'email'
        and status = 'failed'
    )::integer,
    max(created_at),
    max(sent_at) filter (where category = 'reminder' and status in ('sent', 'delivered'))
    into
      v_total_events,
      v_sent_events,
      v_failed_events,
      v_queued_reminders,
      v_processing_reminders,
      v_stale_processing_reminders,
      v_failed_reminders,
      v_last_event_at,
      v_last_dispatch_at
  from accessible_events;

  with accessible_events as (
    select *
    from public.notification_events event
    where event.created_at >= v_since
      and (p_organisation_id is null or event.organisation_id = p_organisation_id)
      and public.bridge_is_active_member(event.organisation_id)
  ),
  status_counts as (
    select status, count(*)::integer as count
    from accessible_events
    group by status
  )
  select coalesce(jsonb_object_agg(status, count order by status), '{}'::jsonb)
    into v_counts_by_status
  from status_counts;

  with accessible_events as (
    select *
    from public.notification_events event
    where event.created_at >= v_since
      and (p_organisation_id is null or event.organisation_id = p_organisation_id)
      and public.bridge_is_active_member(event.organisation_id)
  ),
  category_counts as (
    select category, count(*)::integer as count
    from accessible_events
    group by category
  )
  select coalesce(jsonb_object_agg(category, count order by category), '{}'::jsonb)
    into v_counts_by_category
  from category_counts;

  with accessible_events as (
    select *
    from public.notification_events event
    where event.created_at >= v_since
      and (p_organisation_id is null or event.organisation_id = p_organisation_id)
      and public.bridge_is_active_member(event.organisation_id)
  ),
  automation_counts as (
    select automation_key, count(*)::integer as count
    from accessible_events
    where automation_key is not null
    group by automation_key
  )
  select coalesce(jsonb_object_agg(automation_key, count order by automation_key), '{}'::jsonb)
    into v_counts_by_automation
  from automation_counts;

  with accessible_events as (
    select *
    from public.notification_events event
    where event.created_at >= v_since
      and (p_organisation_id is null or event.organisation_id = p_organisation_id)
      and public.bridge_is_active_member(event.organisation_id)
  ),
  latest_events as (
    select
      id,
      automation_key,
      category,
      trigger_type,
      channel,
      status,
      recipient_role,
      subject,
      created_at,
      sent_at,
      failed_at
    from accessible_events
    order by created_at desc
    limit 12
  )
  select coalesce(jsonb_agg(to_jsonb(latest_events) order by created_at desc), '[]'::jsonb)
    into v_recent_events
  from latest_events;

  with accessible_events as (
    select *
    from public.notification_events event
    where event.created_at >= v_since
      and (p_organisation_id is null or event.organisation_id = p_organisation_id)
      and public.bridge_is_active_member(event.organisation_id)
  ),
  latest_failures as (
    select
      id,
      automation_key,
      category,
      status,
      recipient_role,
      subject,
      error_message,
      last_dispatch_error,
      failed_at,
      created_at
    from accessible_events
    where status = 'failed'
    order by coalesce(failed_at, created_at) desc
    limit 12
  )
  select coalesce(jsonb_agg(to_jsonb(latest_failures) order by coalesce(failed_at, created_at) desc), '[]'::jsonb)
    into v_recent_failures
  from latest_failures;

  with accessible_runs as (
    select distinct run.*
    from public.notification_reminder_runs run
    join public.notification_events event
      on event.reminder_run_id = run.id
    where event.created_at >= v_since
      and (p_organisation_id is null or event.organisation_id = p_organisation_id)
      and public.bridge_is_active_member(event.organisation_id)
  ),
  latest_runs as (
    select
      id,
      started_at,
      finished_at,
      status,
      dry_run,
      limit_count,
      queued_count,
      skipped_count,
      metadata_json
    from accessible_runs
    order by started_at desc
    limit 8
  )
  select coalesce(jsonb_agg(to_jsonb(latest_runs) order by started_at desc), '[]'::jsonb)
    into v_recent_runs
  from latest_runs;

  v_totals := jsonb_build_object(
    'activeDefinitions', v_active_definitions,
    'plannedDefinitions', v_planned_definitions,
    'disabledDefinitions', v_disabled_definitions,
    'totalEvents', v_total_events,
    'sentEvents', v_sent_events,
    'failedEvents', v_failed_events,
    'queuedReminders', v_queued_reminders,
    'processingReminders', v_processing_reminders,
    'staleProcessingReminders', v_stale_processing_reminders,
    'failedReminders', v_failed_reminders,
    'lastEventAt', v_last_event_at,
    'lastDispatchAt', v_last_dispatch_at
  );

  if v_planned_definitions > 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'planned_automations_remaining',
      'severity', 'warning',
      'count', v_planned_definitions,
      'message', 'Some notification automations are still marked planned.'
    ));
  end if;

  if v_stale_processing_reminders > 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'stale_processing_reminders',
      'severity', 'critical',
      'count', v_stale_processing_reminders,
      'message', 'Reminder events are stuck in processing and need a stale reset.'
    ));
  end if;

  if v_failed_reminders > 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'failed_reminders',
      'severity', 'warning',
      'count', v_failed_reminders,
      'message', 'Some reminder emails failed dispatch in the selected window.'
    ));
  end if;

  if v_queued_reminders > 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'queued_reminders_pending_dispatch',
      'severity', 'info',
      'count', v_queued_reminders,
      'message', 'Queued reminder events are waiting to be dispatched.'
    ));
  end if;

  v_status := case
    when v_stale_processing_reminders > 0 then 'critical'
    when v_failed_reminders > 0 or v_planned_definitions > 0 then 'warning'
    when v_queued_reminders > 0 or v_processing_reminders > 0 then 'attention'
    else 'healthy'
  end;

  return jsonb_build_object(
    'status', v_status,
    'generatedAt', now(),
    'since', v_since,
    'organisationId', p_organisation_id,
    'totals', v_totals,
    'countsByStatus', v_counts_by_status,
    'countsByCategory', v_counts_by_category,
    'countsByAutomation', v_counts_by_automation,
    'issues', v_issues,
    'recentEvents', v_recent_events,
    'recentFailures', v_recent_failures,
    'recentRuns', v_recent_runs
  );
end;
$$;

grant execute on function public.bridge_notification_automation_health_phase5(uuid, timestamptz) to authenticated, service_role;

comment on function public.bridge_notification_automation_health_phase5(uuid, timestamptz) is
  'Returns a scoped health snapshot for notification automation definitions, events, reminder queues, dispatch failures, and reminder runs.';

commit;
