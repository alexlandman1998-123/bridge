do $$
begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'notification_automation_definitions', 'notification_events',
          'notification_reminder_runs'
        ) and c.relrowsecurity) <> 3 then
    raise exception 'Expected all three notification automation tables with RLS enabled.';
  end if;

  if (select count(*) from pg_policies
      where schemaname = 'public'
        and tablename in (
          'notification_automation_definitions', 'notification_events',
          'notification_reminder_runs'
        )) <> 5 then
    raise exception 'Expected five notification automation RLS policies.';
  end if;

  if (select count(*) from public.notification_automation_definitions) <> 17
    or exists (
      select 1 from public.notification_automation_definitions
      where implementation_status <> 'active' or not default_enabled
    )
  then
    raise exception 'Expected all seventeen notification automations to be active and enabled.';
  end if;

  if (select count(*) from public.notification_automation_definitions
      where category = 'reminder'
        and jsonb_typeof(reminder_policy -> 'cadenceDays') = 'array'
        and coalesce((reminder_policy #>> '{quietHours,enabled}')::boolean, false)
        and coalesce((reminder_policy #>> '{escalation,enabled}')::boolean, false)) <> 5 then
    raise exception 'All five reminder automations must have cadence, quiet-hour, and escalation controls.';
  end if;

  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'notification_events'
        and column_name in (
          'reminder_run_id', 'source_notification_event_id',
          'dispatch_attempt_count', 'last_dispatch_attempt_at', 'last_dispatch_error'
        )) <> 5 then
    raise exception 'Notification reminder queue/dispatch columns are incomplete.';
  end if;

  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'communication_deliveries'
        and column_name in ('notification_event_id', 'automation_key')) <> 2 then
    raise exception 'Communication delivery notification linkage is incomplete.';
  end if;

  if (select count(*) from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal
        and t.tgname in (
          'trg_notification_automation_definitions_updated_at',
          'trg_notification_events_updated_at',
          'trg_notification_reminder_runs_updated_at',
          'trg_transaction_partner_invite_accepted_notification_phase2',
          'trg_invite_accepted_notification_phase2'
        )) <> 5 then
    raise exception 'A Phase 8 automation or acceptance trigger is missing.';
  end if;

  if has_function_privilege('anon', 'public.bridge_notification_automation_health_phase6(uuid,timestamptz)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.bridge_queue_notification_reminder_events_phase6(integer,timestamptz,boolean,boolean)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.bridge_claim_notification_reminder_events_phase4(integer,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.bridge_record_transaction_partner_invite_accepted_notification_phase2(uuid,uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.bridge_record_notification_event_phase2(text,uuid,text,uuid,uuid,text,text,uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.bridge_notification_automation_set_updated_at()', 'EXECUTE')
  then
    raise exception 'A Phase 8 mutation or internal helper exposes excess privileges.';
  end if;

  if not has_function_privilege('authenticated', 'public.bridge_notification_automation_health_phase6(uuid,timestamptz)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.bridge_queue_notification_reminder_events_phase6(integer,timestamptz,boolean,boolean)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.bridge_claim_notification_reminder_events_phase4(integer,uuid)', 'EXECUTE')
  then
    raise exception 'A required Phase 8 health or dispatcher privilege is missing.';
  end if;

  if has_table_privilege('anon', 'public.notification_automation_definitions', 'SELECT')
    or has_table_privilege('anon', 'public.notification_events', 'SELECT')
    or has_table_privilege('anon', 'public.notification_events', 'INSERT')
    or has_table_privilege('authenticated', 'public.notification_events', 'INSERT')
    or has_table_privilege('authenticated', 'public.notification_events', 'UPDATE')
    or has_table_privilege('authenticated', 'public.notification_reminder_runs', 'SELECT')
    or not has_table_privilege('authenticated', 'public.notification_events', 'SELECT')
    or not has_table_privilege('service_role', 'public.notification_events', 'SELECT,INSERT,UPDATE,DELETE')
  then
    raise exception 'Notification automation table privileges do not match the read/service boundary.';
  end if;
end;
$$;

do $$
declare
  v_health jsonb;
begin
  v_health := public.bridge_notification_automation_health_phase6(null, now() - interval '30 days');
  if coalesce((v_health #>> '{premiumControls,ready}')::boolean, false) is not true
    or coalesce((v_health #>> '{premiumControls,totalReminderAutomations}')::integer, 0) <> 5
  then
    raise exception 'Premium reminder controls are not ready: %', v_health;
  end if;

  v_health := public.bridge_notification_automation_health_phase6(gen_random_uuid(), now() - interval '30 days');
  if v_health ->> 'status' <> 'forbidden' then
    raise exception 'Unscoped organisation health did not fail closed: %', v_health;
  end if;
end;
$$;

select jsonb_build_object(
  'automation_definitions', (select count(*) from public.notification_automation_definitions),
  'active_definitions', (select count(*) from public.notification_automation_definitions where implementation_status = 'active' and default_enabled),
  'reminder_definitions', (select count(*) from public.notification_automation_definitions where category = 'reminder'),
  'notification_events', (select count(*) from public.notification_events),
  'reminder_runs', (select count(*) from public.notification_reminder_runs),
  'automation_policies', (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename in (
      'notification_automation_definitions', 'notification_events', 'notification_reminder_runs'
    )
  ),
  'anon_can_read_health', has_function_privilege('anon', 'public.bridge_notification_automation_health_phase6(uuid,timestamptz)', 'EXECUTE'),
  'authenticated_can_read_health', has_function_privilege('authenticated', 'public.bridge_notification_automation_health_phase6(uuid,timestamptz)', 'EXECUTE'),
  'authenticated_can_queue', has_function_privilege('authenticated', 'public.bridge_queue_notification_reminder_events_phase6(integer,timestamptz,boolean,boolean)', 'EXECUTE'),
  'service_can_queue', has_function_privilege('service_role', 'public.bridge_queue_notification_reminder_events_phase6(integer,timestamptz,boolean,boolean)', 'EXECUTE')
) as phase8_verification;
