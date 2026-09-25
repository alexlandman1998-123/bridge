-- Stop legacy reminder automation from prompting sellers or staff to complete
-- retired online mandate-signing sessions. Preserve queued-event history while
-- marking unsent work as skipped with an explicit retirement reason.
update public.notification_automation_definitions
set
  implementation_status = 'disabled',
  default_enabled = false,
  metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
    'onlineSigningRetired', true,
    'retiredAt', now(),
    'retirementReason', 'Seller mandate signatures require wet-ink originals.'
  ),
  updated_at = now()
where automation_key in (
  'seller_mandate_viewed_unsigned_reminder',
  'seller_mandate_signing_overdue_escalation'
);

update public.notification_events
set
  status = 'skipped',
  error_message = 'Seller mandate online-signing reminder retired; use the wet-ink signature workflow.',
  last_dispatch_error = null,
  failed_at = null,
  next_dispatch_attempt_at = null,
  metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
    'onlineSigningRetired', true,
    'retiredAt', now()
  ),
  updated_at = now()
where automation_key in (
  'seller_mandate_viewed_unsigned_reminder',
  'seller_mandate_signing_overdue_escalation'
)
  and status in ('prepared', 'queued', 'processing', 'failed');
