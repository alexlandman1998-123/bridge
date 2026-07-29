insert into public.notification_automation_definitions (
  automation_key,
  display_name,
  category,
  trigger_type,
  recipient_role,
  channels,
  implementation_status,
  default_enabled,
  dedupe_strategy,
  reminder_policy,
  metadata_json
)
values (
  'agency_public_intake_received',
  'Agency public intake received',
  'notification',
  'system_event',
  'agent',
  array['in_app']::text[],
  'active',
  true,
  'public_intake_submission_once',
  '{}'::jsonb,
  '{"communicationTypes":["agency_public_intake_received"],"phase":"agency_public_intake_phase8","source":"agency_public_intake"}'::jsonb
)
on conflict (automation_key) do update
set display_name = excluded.display_name,
    category = excluded.category,
    trigger_type = excluded.trigger_type,
    recipient_role = excluded.recipient_role,
    channels = excluded.channels,
    implementation_status = excluded.implementation_status,
    default_enabled = excluded.default_enabled,
    dedupe_strategy = excluded.dedupe_strategy,
    reminder_policy = excluded.reminder_policy,
    metadata_json = excluded.metadata_json,
    updated_at = now();

comment on table public.notification_events is
  'Audit log for notification automations and their delivery outcomes, including agency public intake follow-up handoffs.';
