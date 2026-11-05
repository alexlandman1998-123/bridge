begin;

CREATE OR REPLACE FUNCTION public.bridge_queue_transaction_operation_event_phase4(p_transaction transactions, p_automation_key text, p_subject text, p_message text, p_dedupe_key text, p_payload jsonb DEFAULT '{}'::jsonb, p_source text DEFAULT 'transactions'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_recipient record;
  v_event_id uuid;
  v_category text := 'notification';
  v_trigger_type text := 'system_event';
begin
  -- Controlled pilot data must never reach the email dispatcher. This also
  -- covers events emitted by database triggers during transaction creation.
  if coalesce(to_jsonb(p_transaction)->>'is_demo_data','false')='true'
    or p_transaction.routing_profile_json#>'{testDataProtection,isTestData}'='true'::jsonb
    or p_transaction.routing_profile_json#>'{testDataProtection,externalDeliveryAllowed}'='false'::jsonb then
    return null;
  end if;

  if p_transaction.id is null or p_transaction.organisation_id is null then
    return null;
  end if;

  if p_automation_key = 'transaction_stalled' then
    v_category := 'reminder';
    v_trigger_type := 'scheduled_reminder';
  end if;

  if not exists (
    select 1
    from public.notification_automation_definitions definition
    where definition.automation_key = p_automation_key
      and definition.implementation_status = 'active'
      and definition.default_enabled = true
  ) then
    return null;
  end if;

  select *
  into v_recipient
  from public.bridge_transaction_owner_email_phase4(p_transaction)
  limit 1;

  if nullif(trim(coalesce(v_recipient.email, '')), '') is null then
    return null;
  end if;

  insert into public.notification_events (
    automation_key, organisation_id, branch_id, assigned_user_id, transaction_id,
    recipient_user_id, event_key, category, trigger_type, channel, status,
    recipient_email, recipient_address, recipient_role, subject, message_preview,
    provider, source, dedupe_key, idempotency_key, payload_json, metadata_json,
    queued_at, next_dispatch_attempt_at
  ) values (
    p_automation_key, p_transaction.organisation_id, p_transaction.assigned_branch_id,
    coalesce(p_transaction.owner_user_id, p_transaction.assigned_user_id, p_transaction.assigned_agent_id),
    p_transaction.id, v_recipient.user_id, p_automation_key, v_category, v_trigger_type,
    'email', 'queued', lower(v_recipient.email), lower(v_recipient.email),
    'transaction_owner', nullif(trim(coalesce(p_subject, '')), ''),
    left(trim(coalesce(p_message, '')), 320), 'resend',
    coalesce(nullif(trim(p_source), ''), 'transactions'), nullif(trim(p_dedupe_key), ''),
    nullif(trim(p_dedupe_key), ''),
    jsonb_strip_nulls(coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
      'transactionId', p_transaction.id,
      'transactionReference', public.bridge_transaction_reference_phase4(p_transaction),
      'propertyLabel', public.bridge_transaction_property_label_phase4(p_transaction),
      'stage', public.bridge_transaction_stage_label_phase4(p_transaction),
      'recipientName', v_recipient.name,
      'ownerName', v_recipient.name,
      'ownerEmail', v_recipient.email
    )),
    jsonb_build_object(
      'phase', 'phase_4_transaction_roleplayer_notifications',
      'sendEmailType', 'transaction_operations_dispatch'
    ),
    now(), now()
  )
  on conflict (organisation_id, dedupe_key)
    where automation_key in (
      'transaction_created',
      'transaction_owner_changed',
      'transaction_roleplayer_assigned',
      'transaction_roleplayer_reassigned',
      'transaction_partner_accepted',
      'transaction_partner_declined',
      'transaction_stage_changed',
      'transaction_stalled',
      'transaction_cancelled',
      'transaction_archived',
      'transaction_reactivated'
    )
    and dedupe_key is not null
  do nothing
  returning id into v_event_id;

  return v_event_id;
end;
$function$;

commit;
