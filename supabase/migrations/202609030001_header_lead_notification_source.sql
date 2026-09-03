begin;

-- Keep the in-app alert self-contained: the header can state where a new
-- attorney lead came from without issuing a separate lead lookup.
create or replace function public.bridge_emit_attorney_lead_notification(
  p_organisation_id uuid,
  p_lead_id uuid,
  p_preferred_user_id uuid,
  p_automation_key text,
  p_title text,
  p_message text,
  p_dedupe_key text,
  p_source text default 'attorney_leads_phase9'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_event_id uuid;
  v_notification_id uuid;
  v_lead_source text;
begin
  select coalesce(
    nullif(trim(lead.lead_source), ''),
    nullif(trim(lead.source_channel), ''),
    'Direct'
  )
    into v_lead_source
  from public.leads lead
  where lead.lead_id = p_lead_id
    and lead.organisation_id = p_organisation_id
    and lead.lead_domain = 'attorney';

  if not found then
    return jsonb_build_object('emitted', false, 'reason', 'lead_unavailable');
  end if;

  v_recipient := public.bridge_attorney_lead_notification_recipient(
    p_organisation_id, p_preferred_user_id
  );
  if v_recipient is null then
    return jsonb_build_object('emitted', false, 'reason', 'recipient_unavailable');
  end if;

  v_event_id := public.bridge_record_notification_event_phase2(
    p_automation_key,
    p_organisation_id,
    p_source,
    auth.uid(),
    v_recipient,
    'attorney',
    null,
    null,
    null,
    p_lead_id,
    null,
    left(coalesce(p_title, 'Attorney Lead update'), 200),
    left(coalesce(p_message, ''), 320),
    p_dedupe_key,
    jsonb_build_object(
      'leadId', p_lead_id,
      'leadSource', v_lead_source,
      'actionRoute', '/attorney/leads',
      'entityLabel', 'Attorney Lead'
    ),
    jsonb_build_object('domain', 'attorney_lead', 'phase', 'phase_9')
  );

  v_notification_id := public.bridge_insert_invite_accepted_transaction_notification_phase2(
    null,
    v_recipient,
    'attorney',
    left(coalesce(p_title, 'Attorney Lead update'), 200),
    left(coalesce(p_message, ''), 1000),
    p_dedupe_key,
    jsonb_build_object(
      'leadId', p_lead_id,
      'leadSource', v_lead_source,
      'actionRoute', '/attorney/leads',
      'entityLabel', 'Attorney Lead',
      'notificationDomain', 'attorney_lead',
      'automationKey', p_automation_key
    )
  );

  return jsonb_build_object(
    'emitted', v_event_id is not null or v_notification_id is not null,
    'recipient_user_id', v_recipient,
    'notification_event_id', v_event_id,
    'in_app_notification_id', v_notification_id
  );
end;
$$;

commit;
