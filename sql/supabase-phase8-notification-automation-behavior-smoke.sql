begin;

do $$
declare
  v_recipient_user_id uuid;
  v_notification_id uuid;
  v_second_notification_id uuid;
  v_dedupe_key text := 'phase8-smoke:' || gen_random_uuid()::text;
  v_queue_result jsonb;
begin
  select id into v_recipient_user_id
  from public.profiles
  order by created_at, id
  limit 1;

  if v_recipient_user_id is null then
    raise exception 'Phase 8 smoke requires one profile fixture.';
  end if;

  v_notification_id := public.bridge_insert_invite_accepted_transaction_notification_phase2(
    null,
    v_recipient_user_id,
    'agent',
    'Phase 8 rollback-only notification',
    'The notification projection is valid.',
    v_dedupe_key,
    jsonb_build_object('phase', 'phase8_smoke')
  );

  if v_notification_id is null then
    raise exception 'Corrected transaction-notification projection returned null.';
  end if;

  if not exists (
    select 1 from public.transaction_notifications
    where id = v_notification_id
      and user_id = v_recipient_user_id
      and role_type = 'agent'
      and notification_type = 'participant_assigned'
      and dedupe_key = v_dedupe_key
  ) then
    raise exception 'Corrected transaction-notification projection wrote an invalid row.';
  end if;

  v_second_notification_id := public.bridge_insert_invite_accepted_transaction_notification_phase2(
    null, v_recipient_user_id, 'agent', null, null, v_dedupe_key, '{}'::jsonb
  );
  if v_second_notification_id is distinct from v_notification_id
    or (select count(*) from public.transaction_notifications where dedupe_key = v_dedupe_key) <> 1
  then
    raise exception 'Invite-acceptance notification dedupe is not idempotent.';
  end if;

  v_queue_result := public.bridge_queue_notification_reminder_events_phase6(
    50, now(), true, false
  );
  if not coalesce((v_queue_result ->> 'success')::boolean, false)
    or not coalesce((v_queue_result ->> 'dryRun')::boolean, false)
    or v_queue_result ->> 'phase' <> 'phase_6_premium_controls'
  then
    raise exception 'Premium reminder dry-run failed: %', v_queue_result;
  end if;
end;
$$;

select jsonb_build_object(
  'status', 'passed',
  'mode', 'rollback_only',
  'notification_projection', true,
  'dedupe', true,
  'premium_queue_dry_run', true
) as phase8_behavior_smoke;

rollback;
