begin;

-- Restore the six seller-document automation definitions required by the
-- release-readiness snapshot. Earlier schema repairs restored the delivery
-- paths but the definitions themselves were absent from the live catalogue.
insert into public.notification_automation_definitions (
  automation_key, display_name, category, trigger_type, recipient_role,
  channels, implementation_status, default_enabled, dedupe_strategy,
  reminder_policy, metadata_json
)
values
  (
    'seller_document_requested', 'Seller document requested', 'notification', 'system_event', 'seller',
    array['in_app', 'email']::text[], 'active', true, 'listing_requirement_revision',
    '{}'::jsonb,
    '{"phase":"p0_3","purpose":"Initial seller-visible document request event"}'::jsonb
  ),
  (
    'seller_document_request_reminder', 'Seller document request reminder', 'reminder', 'scheduled_reminder', 'seller',
    array['email', 'in_app']::text[], 'active', true, 'listing_requirement_revision_day',
    '{"cadenceDays":[0,2,5,9],"stopWhen":"seller_document_supplied","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8},"escalation":{"enabled":true,"afterDay":9,"recipientRole":"assigned_user"}}'::jsonb,
    '{"phase":"p0_3","purpose":"Document-specific follow-up with automatic stop conditions"}'::jsonb
  ),
  (
    'seller_document_request_escalation', 'Seller document request escalation', 'notification', 'system_event', 'agent',
    array['in_app']::text[], 'active', true, 'listing_requirement_revision',
    '{}'::jsonb,
    '{"phase":"p0_3","purpose":"Assigned-agent escalation after the final seller reminder"}'::jsonb
  ),
  (
    'seller_document_review_sla_warning', 'Seller document review due soon', 'notification', 'system_event', 'agent',
    array['in_app']::text[], 'active', true, 'document_sla_revision_level',
    '{"thresholdHours":24}'::jsonb, '{"phase":"P1-9"}'::jsonb
  ),
  (
    'seller_document_review_sla_breach', 'Seller document review SLA breached', 'notification', 'system_event', 'agent',
    array['in_app']::text[], 'active', true, 'document_sla_revision_level',
    '{"thresholdHours":48}'::jsonb, '{"phase":"P1-9"}'::jsonb
  ),
  (
    'seller_document_review_sla_critical', 'Seller document review critically overdue', 'notification', 'system_event', 'agency_admin',
    array['in_app']::text[], 'active', true, 'document_sla_revision_level',
    '{"thresholdHours":96}'::jsonb, '{"phase":"P1-9"}'::jsonb
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
    metadata_json = coalesce(public.notification_automation_definitions.metadata_json, '{}'::jsonb) || excluded.metadata_json,
    updated_at = now();

commit;
