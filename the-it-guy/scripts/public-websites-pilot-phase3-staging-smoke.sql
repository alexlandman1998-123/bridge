begin;

create temporary table website_phase3_smoke_evidence (
  check_name text primary key,
  passed boolean not null,
  detail jsonb not null default '{}'::jsonb
) on commit drop;

delete from public.website_lead_submissions
where id = '7a5c01b2-0d9d-4f50-8a1f-c0f3f73a3001';
delete from public.notification_events
where id = '8b6d12c3-1eae-4061-9b20-d1a4084b3002'
   or dedupe_key = 'website-lead:phase3-staging-smoke:fallback';

insert into public.website_lead_submissions (
  id, website_site_id, organisation_id, submission_type, idempotency_key,
  payload_json, attribution_json, consent_json, routing_json, status,
  notification_status, lead_id, routed_at
)
select
  '7a5c01b2-0d9d-4f50-8a1f-c0f3f73a3001',
  '2c3cb38a-3389-49dc-b0f2-ea21106d2a2d',
  'ec19d0a6-bcba-4eef-aa72-9972de88204d',
  'general_enquiry',
  'phase3-staging-smoke-0001',
  '{"name":"Phase Three Smoke"}'::jsonb,
  '{}'::jsonb,
  '{"privacyAccepted":true,"marketingConsent":false}'::jsonb,
  '{"fallbackEmail":"phase3-manager@example.invalid","fallbackName":"Phase Three Manager"}'::jsonb,
  'routed',
  'pending',
  existing.lead_id,
  pg_catalog.clock_timestamp()
from public.website_lead_submissions existing
where existing.id = '675f72ac-979c-4b91-8d45-e96acac9d915';

insert into public.notification_events (
  id, automation_key, organisation_id, lead_id, event_key, category,
  trigger_type, channel, status, recipient_email, recipient_role, subject,
  message_preview, source, dedupe_key, payload_json, metadata_json,
  prepared_at, queued_at
)
select
  '8b6d12c3-1eae-4061-9b20-d1a4084b3002',
  'website_lead_received',
  receipt.organisation_id,
  receipt.lead_id,
  'new_enquiry_assigned_agent',
  'notification',
  'system_event',
  'email',
  'queued',
  'phase3-agent@example.invalid',
  'agent',
  'Phase 3 retry smoke',
  'Synthetic staging-only retry and fallback verification.',
  'agency_website',
  'website-lead:phase3-staging-smoke:primary',
  '{"eventKind":"new_enquiry_assigned_agent","leadName":"Phase Three Smoke","leadCategory":"buyer"}'::jsonb,
  '{"websiteSubmissionId":"7a5c01b2-0d9d-4f50-8a1f-c0f3f73a3001"}'::jsonb,
  pg_catalog.clock_timestamp(),
  pg_catalog.clock_timestamp()
from public.website_lead_submissions receipt
where receipt.id = '7a5c01b2-0d9d-4f50-8a1f-c0f3f73a3001';

update public.website_lead_submissions
set notification_event_id = '8b6d12c3-1eae-4061-9b20-d1a4084b3002'
where id = '7a5c01b2-0d9d-4f50-8a1f-c0f3f73a3001';

select public.website_claim_lead_notifications(
  1,
  '8b6d12c3-1eae-4061-9b20-d1a4084b3002'
);
select public.website_complete_lead_notification(
  '7a5c01b2-0d9d-4f50-8a1f-c0f3f73a3001',
  '8b6d12c3-1eae-4061-9b20-d1a4084b3002',
  'failed',
  null,
  'Synthetic transient failure.'
);

insert into website_phase3_smoke_evidence (check_name, passed, detail)
select
  'bounded_retry',
  event.status = 'failed'
    and event.dispatch_attempt_count = 1
    and event.max_dispatch_attempts = 3
    and event.next_dispatch_attempt_at > pg_catalog.clock_timestamp()
    and receipt.notification_status = 'pending',
  pg_catalog.jsonb_build_object(
    'eventStatus', event.status,
    'attemptCount', event.dispatch_attempt_count,
    'maxAttempts', event.max_dispatch_attempts,
    'retryScheduled', event.next_dispatch_attempt_at is not null,
    'receiptStatus', receipt.notification_status
  )
from public.notification_events event
join public.website_lead_submissions receipt
  on receipt.notification_event_id = event.id
where event.id = '8b6d12c3-1eae-4061-9b20-d1a4084b3002';

update public.notification_events
set status = 'failed',
    dispatch_attempt_count = 2,
    next_dispatch_attempt_at = pg_catalog.clock_timestamp()
where id = '8b6d12c3-1eae-4061-9b20-d1a4084b3002';

select public.website_claim_lead_notifications(
  1,
  '8b6d12c3-1eae-4061-9b20-d1a4084b3002'
);
select public.website_complete_lead_notification(
  '7a5c01b2-0d9d-4f50-8a1f-c0f3f73a3001',
  '8b6d12c3-1eae-4061-9b20-d1a4084b3002',
  'failed',
  null,
  'Synthetic terminal failure.'
);
select public.website_prepare_lead_notification_fallback(
  '7a5c01b2-0d9d-4f50-8a1f-c0f3f73a3001',
  'Synthetic terminal failure.'
);

insert into website_phase3_smoke_evidence (check_name, passed, detail)
select
  'manager_fallback',
  primary_event.status = 'failed'
    and primary_event.dispatch_attempt_count = 3
    and fallback_event.status = 'queued'
    and fallback_event.event_key = 'new_enquiry_unassigned_manager'
    and fallback_event.max_dispatch_attempts = 5
    and receipt.notification_status = 'pending',
  pg_catalog.jsonb_build_object(
    'primaryStatus', primary_event.status,
    'primaryAttempts', primary_event.dispatch_attempt_count,
    'fallbackStatus', fallback_event.status,
    'fallbackAttempts', fallback_event.dispatch_attempt_count,
    'fallbackMaxAttempts', fallback_event.max_dispatch_attempts,
    'receiptStatus', receipt.notification_status
  )
from public.website_lead_submissions receipt
join public.notification_events primary_event on primary_event.id = receipt.notification_event_id
join public.notification_events fallback_event on fallback_event.id = receipt.fallback_notification_event_id
where receipt.id = '7a5c01b2-0d9d-4f50-8a1f-c0f3f73a3001';

delete from public.website_lead_submissions
where id = '7a5c01b2-0d9d-4f50-8a1f-c0f3f73a3001';
delete from public.notification_events
where id = '8b6d12c3-1eae-4061-9b20-d1a4084b3002'
   or dedupe_key in (
     'website-lead:phase3-staging-smoke:primary',
     'website-lead:7a5c01b2-0d9d-4f50-8a1f-c0f3f73a3001:fallback'
   );

select check_name, passed, detail
from website_phase3_smoke_evidence
order by check_name;

commit;
