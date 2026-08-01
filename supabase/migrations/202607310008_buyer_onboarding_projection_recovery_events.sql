begin;

-- Buyer onboarding submit now treats post-snapshot projections as recoverable.
-- The browser session is still an anon/authenticated onboarding-token session,
-- so recovery marker writes need their own narrowly-scoped RLS path.
grant insert on public.transaction_events to anon, authenticated;

drop policy if exists transaction_events_insert_buyer_onboarding_projection_recovery
  on public.transaction_events;

create policy transaction_events_insert_buyer_onboarding_projection_recovery
  on public.transaction_events
  for insert
  to anon, authenticated
  with check (
    public.bridge_has_onboarding_token_transaction_access(transaction_id)
    and event_type in (
      'buyer_onboarding_required_documents_projection_failed',
      'buyer_onboarding_platform_fee_consent_projection_failed',
      'buyer_onboarding_information_sheet_projection_failed',
      'buyer_onboarding_roleplayer_projection_failed',
      'buyer_onboarding_workflow_evidence_projection_failed',
      'buyer_onboarding_awaiting_signed_otp_projection_failed',
      'buyer_onboarding_finance_event_projection_failed'
    )
    and coalesce(visibility_scope, 'internal') = 'internal'
    and created_by is null
    and lower(trim(coalesce(created_by_role, ''))) = 'system'
    and coalesce(event_data ->> 'source', '') = 'buyer_onboarding_projection_recovery_marker'
    and coalesce(event_data ->> 'recoveryRequired', '') = 'true'
    and coalesce(event_data ->> 'retryable', '') = 'true'
  );

comment on policy transaction_events_insert_buyer_onboarding_projection_recovery
  on public.transaction_events is
  'Allows scoped buyer onboarding token sessions to record sanitized projection-recovery markers only.';

commit;
