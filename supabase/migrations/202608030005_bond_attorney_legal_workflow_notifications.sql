begin;

insert into public.notification_automation_definitions (
  automation_key, display_name, category, trigger_type, recipient_role,
  channels, implementation_status, default_enabled, dedupe_strategy,
  reminder_policy, metadata_json
) values
  ('bond_application_submitted', 'Bond application submitted', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'bond_application_transaction_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('bond_application_status_changed', 'Bond application status changed', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'bond_application_status_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('bond_additional_documents_requested', 'Bond additional documents requested', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'bond_documents_requested_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('bond_document_uploaded', 'Bond document uploaded', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'bond_document_uploaded_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('bond_bank_offer_received', 'Bond bank offer received', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'bond_bank_offer_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('bond_bank_offer_buyer_decision', 'Bond bank offer buyer decision', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'bond_bank_offer_decision_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('bond_grant_received', 'Bond grant received', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'bond_grant_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('bond_grant_published', 'Bond grant published', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'bond_grant_published_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('bond_delivery_failed', 'Bond delivery failed', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'bond_delivery_failed_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('attorney_instruction_ready', 'Attorney instruction ready', 'notification', 'system_event', 'attorney', array['email']::text[], 'active', true, 'attorney_instruction_ready', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('attorney_instruction_accepted', 'Attorney instruction accepted', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'attorney_instruction_accepted_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('attorney_instruction_declined', 'Attorney instruction declined', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'attorney_instruction_declined_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('attorney_assignment_changed', 'Attorney assignment changed', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'attorney_assignment_changed_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('attorney_matter_stage_changed', 'Attorney matter stage changed', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'attorney_matter_stage_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('attorney_client_financial_document_published', 'Attorney client financial document published', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'attorney_financial_document_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('legal_packet_generated', 'Legal packet generated', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'legal_packet_generated_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('legal_packet_sent_for_signing', 'Legal packet sent for signing', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'legal_packet_signing_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('legal_signer_viewed', 'Legal signer viewed packet', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'legal_signer_viewed_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('legal_signer_signed', 'Legal signer signed packet', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'legal_signer_signed_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('legal_packet_completed', 'Legal packet completed', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'legal_packet_completed_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb),
  ('legal_signing_dispatch_failed', 'Legal signing dispatch failed', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'legal_dispatch_failed_owner', '{}'::jsonb, '{"phase":"phase_6_bond_attorney_legal_workflow_coverage"}'::jsonb)
on conflict (automation_key) do update set
  display_name = excluded.display_name,
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

alter table public.notification_events
  add column if not exists recipient_user_id uuid references auth.users(id) on delete set null,
  add column if not exists recipient_address text,
  add column if not exists idempotency_key text,
  add column if not exists dispatch_attempt_count integer not null default 0,
  add column if not exists max_dispatch_attempts integer not null default 5,
  add column if not exists last_dispatch_attempt_at timestamptz,
  add column if not exists next_dispatch_attempt_at timestamptz,
  add column if not exists last_dispatch_error text,
  add column if not exists resend_of_event_id uuid references public.notification_events(id) on delete set null;

alter table public.notification_events
  drop constraint if exists notification_events_status_check;
alter table public.notification_events
  add constraint notification_events_status_check
  check (status in ('prepared', 'queued', 'processing', 'sent', 'delivered', 'failed', 'skipped'));

create unique index if not exists notification_events_bond_attorney_legal_dedupe_idx
  on public.notification_events (organisation_id, dedupe_key)
  where automation_key in (
    'bond_application_submitted',
    'bond_application_status_changed',
    'bond_additional_documents_requested',
    'bond_document_uploaded',
    'bond_bank_offer_received',
    'bond_bank_offer_buyer_decision',
    'bond_grant_received',
    'bond_grant_published',
    'bond_delivery_failed',
    'attorney_instruction_ready',
    'attorney_instruction_accepted',
    'attorney_instruction_declined',
    'attorney_assignment_changed',
    'attorney_matter_stage_changed',
    'attorney_client_financial_document_published',
    'legal_packet_generated',
    'legal_packet_sent_for_signing',
    'legal_signer_viewed',
    'legal_signer_signed',
    'legal_packet_completed',
    'legal_signing_dispatch_failed'
  )
  and dedupe_key is not null;

create index if not exists notification_events_bond_attorney_legal_dispatch_idx
  on public.notification_events (next_dispatch_attempt_at, queued_at, created_at)
  where automation_key in (
    'bond_application_submitted',
    'bond_application_status_changed',
    'bond_additional_documents_requested',
    'bond_document_uploaded',
    'bond_bank_offer_received',
    'bond_bank_offer_buyer_decision',
    'bond_grant_received',
    'bond_grant_published',
    'bond_delivery_failed',
    'attorney_instruction_ready',
    'attorney_instruction_accepted',
    'attorney_instruction_declined',
    'attorney_assignment_changed',
    'attorney_matter_stage_changed',
    'attorney_client_financial_document_published',
    'legal_packet_generated',
    'legal_packet_sent_for_signing',
    'legal_signer_viewed',
    'legal_signer_signed',
    'legal_packet_completed',
    'legal_signing_dispatch_failed'
  )
  and channel = 'email'
  and status in ('queued', 'failed');

create or replace function public.bridge_phase6_title_case(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select initcap(replace(coalesce(nullif(trim(p_value), ''), 'workflow'), '_', ' '))
$$;

create or replace function public.bridge_bond_legal_transaction_context_phase6(p_transaction_id uuid)
returns table(
  organisation_id uuid,
  listing_id uuid,
  recipient_user_id uuid,
  recipient_email text,
  recipient_name text,
  transaction_reference text,
  property_label text
)
language sql
stable
set search_path = ''
as $$
  select
    tx.organisation_id,
    tx.listing_id,
    coalesce(tx.owner_user_id, tx.assigned_user_id, tx.assigned_agent_id) as recipient_user_id,
    lower(nullif(trim(coalesce(profile.email, tx.assigned_agent_email)), '')) as recipient_email,
    nullif(trim(coalesce(profile.full_name, tx.assigned_agent, profile.email)), '') as recipient_name,
    coalesce(
      nullif(to_jsonb(tx)->>'transaction_reference', ''),
      nullif(to_jsonb(tx)->>'matter_number', ''),
      tx.id::text
    ) as transaction_reference,
    coalesce(
      nullif(concat_ws(', ',
        nullif(to_jsonb(tx)->>'property_address_line_1', ''),
        nullif(to_jsonb(tx)->>'suburb', ''),
        nullif(to_jsonb(tx)->>'city', '')
      ), ''),
      nullif(to_jsonb(tx)->>'property_title', ''),
      nullif(to_jsonb(tx)->>'listing_title', ''),
      ''
    ) as property_label
  from public.transactions tx
  left join public.profiles profile
    on profile.id = coalesce(tx.owner_user_id, tx.assigned_user_id, tx.assigned_agent_id)
  where tx.id = p_transaction_id
  limit 1
$$;

create or replace function public.bridge_queue_bond_attorney_legal_event_phase6(
  p_automation_key text,
  p_transaction_id uuid,
  p_subject text,
  p_message text,
  p_dedupe_key text,
  p_payload jsonb default '{}'::jsonb,
  p_source text default 'bond_attorney_legal_workflow'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context record;
  v_event_id uuid;
begin
  select * into v_context
  from public.bridge_bond_legal_transaction_context_phase6(p_transaction_id)
  limit 1;

  if v_context.organisation_id is null
    or nullif(trim(coalesce(v_context.recipient_email, '')), '') is null then
    return null;
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

  insert into public.notification_events (
    automation_key, organisation_id, transaction_id, listing_id,
    recipient_user_id, event_key, category, trigger_type, channel, status,
    recipient_email, recipient_address, recipient_role, subject, message_preview,
    provider, source, dedupe_key, idempotency_key, payload_json, metadata_json,
    queued_at, next_dispatch_attempt_at
  ) values (
    p_automation_key, v_context.organisation_id, p_transaction_id, v_context.listing_id,
    v_context.recipient_user_id, p_automation_key, 'notification', 'system_event',
    'email', 'queued', lower(v_context.recipient_email), lower(v_context.recipient_email),
    'transaction_owner', nullif(trim(coalesce(p_subject, '')), ''),
    left(trim(coalesce(p_message, '')), 320), 'resend',
    coalesce(nullif(trim(p_source), ''), 'bond_attorney_legal_workflow'),
    nullif(trim(p_dedupe_key), ''),
    nullif(trim(p_dedupe_key), ''),
    jsonb_strip_nulls(coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
      'organisationId', v_context.organisation_id,
      'transactionId', p_transaction_id,
      'transactionReference', v_context.transaction_reference,
      'propertyLabel', v_context.property_label,
      'recipientName', v_context.recipient_name
    )),
    jsonb_build_object(
      'phase', 'phase_6_bond_attorney_legal_workflow_coverage',
      'sendEmailType', 'bond_attorney_legal_dispatch'
    ),
    now(), now()
  )
  on conflict (organisation_id, dedupe_key)
    where automation_key in (
      'bond_application_submitted',
      'bond_application_status_changed',
      'bond_additional_documents_requested',
      'bond_document_uploaded',
      'bond_bank_offer_received',
      'bond_bank_offer_buyer_decision',
      'bond_grant_received',
      'bond_grant_published',
      'bond_delivery_failed',
      'attorney_instruction_ready',
      'attorney_instruction_accepted',
      'attorney_instruction_declined',
      'attorney_assignment_changed',
      'attorney_matter_stage_changed',
      'attorney_client_financial_document_published',
      'legal_packet_generated',
      'legal_packet_sent_for_signing',
      'legal_signer_viewed',
      'legal_signer_signed',
      'legal_packet_completed',
      'legal_signing_dispatch_failed'
    )
    and dedupe_key is not null
  do nothing
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.bridge_handle_bond_application_notifications_phase6()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := lower(coalesce(to_jsonb(new)->>'status', ''));
  v_old_status text := lower(coalesce(to_jsonb(old)->>'status', ''));
  v_key text := 'bond_application_status_changed';
  v_label text := public.bridge_phase6_title_case(v_status);
begin
  if tg_op = 'UPDATE' and v_old_status is not distinct from v_status then
    return new;
  end if;

  if v_status = 'submitted' then
    v_key := 'bond_application_submitted';
  elsif v_status = 'additional_documents_required' then
    v_key := 'bond_additional_documents_requested';
  end if;

  perform public.bridge_queue_bond_attorney_legal_event_phase6(
    v_key,
    new.transaction_id,
    case when v_key = 'bond_application_submitted' then 'Bond application submitted' else 'Bond application updated' end,
    'Bond application status changed to ' || v_label || '.',
    v_key || ':transaction-bond-application:' || new.id::text || ':' || coalesce(nullif(v_status, ''), 'unknown'),
    jsonb_strip_nulls(jsonb_build_object(
      'workflowLabel', 'Bond Application',
      'status', v_label,
      'previousStatus', public.bridge_phase6_title_case(v_old_status),
      'institutionName', nullif(to_jsonb(new)->>'bank_name', ''),
      'nextAction', case when v_key = 'bond_additional_documents_requested' then 'Review the requested documents and follow up with the buyer.' else null end
    )),
    tg_table_name
  );

  return new;
end;
$$;

drop trigger if exists trg_bond_application_notifications_phase6
  on public.transaction_bond_applications;
create trigger trg_bond_application_notifications_phase6
after insert or update on public.transaction_bond_applications
for each row execute function public.bridge_handle_bond_application_notifications_phase6();

drop trigger if exists trg_guided_bond_application_notifications_phase6
  on public.bond_applications;
create trigger trg_guided_bond_application_notifications_phase6
after insert or update on public.bond_applications
for each row execute function public.bridge_handle_bond_application_notifications_phase6();

create or replace function public.bridge_handle_bond_quote_notifications_phase6()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := lower(coalesce(new.quote_status, 'received'));
  v_old_status text := lower(coalesce(old.quote_status, ''));
  v_key text := 'bond_bank_offer_received';
begin
  if tg_op = 'UPDATE' and v_old_status is not distinct from v_status then
    return new;
  end if;

  if v_status in ('approved_by_buyer', 'declined_by_buyer') then
    v_key := 'bond_bank_offer_buyer_decision';
  end if;

  perform public.bridge_queue_bond_attorney_legal_event_phase6(
    v_key,
    new.transaction_id,
    case when v_key = 'bond_bank_offer_buyer_decision' then 'Buyer responded to a bank offer' else 'New bank offer received' end,
    coalesce(nullif(new.bank_name, ''), 'A bank') || ' bond offer status is ' || public.bridge_phase6_title_case(v_status) || '.',
    v_key || ':transaction-bond-quote:' || new.id::text || ':' || v_status,
    jsonb_strip_nulls(jsonb_build_object(
      'workflowLabel', 'Bond Offer',
      'status', public.bridge_phase6_title_case(v_status),
      'previousStatus', public.bridge_phase6_title_case(v_old_status),
      'institutionName', new.bank_name,
      'amountLabel', case when new.quoted_amount is not null then trim(to_char(new.quoted_amount, 'FM999G999G999G990D00')) else null end,
      'nextAction', case when v_status = 'approved_by_buyer' then 'Proceed with bond grant and attorney handoff.' else null end
    )),
    tg_table_name
  );

  return new;
end;
$$;

drop trigger if exists trg_bond_quote_notifications_phase6
  on public.transaction_bond_quotes;
create trigger trg_bond_quote_notifications_phase6
after insert or update on public.transaction_bond_quotes
for each row execute function public.bridge_handle_bond_quote_notifications_phase6();

create or replace function public.bridge_handle_bond_originator_notifications_phase6()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text := tg_table_name;
  v_status text := lower(coalesce(to_jsonb(new)->>'status', ''));
  v_old_status text := lower(coalesce(to_jsonb(old)->>'status', ''));
  v_key text := '';
  v_subject text := '';
  v_bank text := coalesce(to_jsonb(new)->>'bank_name', to_jsonb(new)->>'destination_key', 'Bond originator');
  v_amount text := coalesce(
    nullif(trim(to_jsonb(new)->>'offered_amount'), ''),
    nullif(trim(to_jsonb(new)->>'approved_amount'), '')
  );
begin
  if tg_op = 'UPDATE' and v_old_status is not distinct from v_status then
    return new;
  end if;

  if v_table = 'transaction_bond_originator_document_requests' then
    if v_status in ('sent', 'viewed', 'in_progress', 'needs_more_information', 'rejected') then
      v_key := 'bond_additional_documents_requested';
      v_subject := 'Additional bond documents requested';
    elsif v_status in ('awaiting_review', 'accepted') or (to_jsonb(new)->>'uploaded_at') is not null then
      v_key := 'bond_document_uploaded';
      v_subject := 'Bond document uploaded';
    end if;
  elsif v_table = 'transaction_bond_originator_bank_offer_captures' then
    if (to_jsonb(new)->>'buyer_decision') is not null then
      v_key := 'bond_bank_offer_buyer_decision';
      v_subject := 'Buyer responded to a bank offer';
    elsif v_status in ('captured', 'published_to_buyer', 'accepted_by_buyer', 'declined_by_buyer') then
      v_key := 'bond_bank_offer_received';
      v_subject := 'New bank offer received';
    end if;
  elsif v_table = 'transaction_bond_originator_grant_captures' then
    v_key := case when (to_jsonb(new)->>'published_at') is not null or v_status = 'published_to_buyer' then 'bond_grant_published' else 'bond_grant_received' end;
    v_subject := case when v_key = 'bond_grant_published' then 'Bond grant published' else 'Bond grant received' end;
  elsif v_table = 'transaction_bond_bank_outcomes' then
    if lower(coalesce(to_jsonb(new)->>'outcome', '')) = 'additional_documents_required' then
      v_key := 'bond_additional_documents_requested';
      v_subject := 'Additional bond documents requested';
    else
      v_key := 'bond_application_status_changed';
      v_subject := 'Bond application updated';
    end if;
  elsif v_table = 'transaction_bond_application_submissions' then
    if v_status = 'submitted' then
      v_key := 'bond_application_submitted';
      v_subject := 'Bond application submitted';
    elsif v_status = 'failed' then
      v_key := 'bond_delivery_failed';
      v_subject := 'Bond delivery failed';
    end if;
  elsif v_table = 'transaction_bond_application_delivery_attempts' and v_status = 'failed' then
    v_key := 'bond_delivery_failed';
    v_subject := 'Bond delivery failed';
  end if;

  if v_key = '' then
    return new;
  end if;

  perform public.bridge_queue_bond_attorney_legal_event_phase6(
    v_key,
    new.transaction_id,
    v_subject,
    v_subject || ' for the transaction.',
    v_key || ':' || v_table || ':' || new.id::text || ':' || coalesce(nullif(v_status, ''), coalesce(to_jsonb(new)->>'buyer_decision', 'event')),
    jsonb_strip_nulls(jsonb_build_object(
      'workflowLabel', 'Bond Originator',
      'status', public.bridge_phase6_title_case(coalesce(nullif(v_status, ''), to_jsonb(new)->>'buyer_decision')),
      'previousStatus', public.bridge_phase6_title_case(v_old_status),
      'institutionName', v_bank,
      'documentTitle', coalesce(to_jsonb(new)->>'canonical_document_type', to_jsonb(new)->>'requirement_key'),
      'amountLabel', v_amount,
      'reason', coalesce(to_jsonb(new)->>'error_summary', to_jsonb(new)->>'buyer_safe_feedback'),
      'nextAction', case when v_key in ('bond_delivery_failed', 'bond_additional_documents_requested') then 'Review the bond workspace and follow up on the outstanding item.' else null end
    )),
    v_table
  );

  return new;
end;
$$;

drop trigger if exists trg_bond_originator_document_request_notifications_phase6
  on public.transaction_bond_originator_document_requests;
create trigger trg_bond_originator_document_request_notifications_phase6
after insert or update on public.transaction_bond_originator_document_requests
for each row execute function public.bridge_handle_bond_originator_notifications_phase6();

drop trigger if exists trg_bond_originator_bank_offer_notifications_phase6
  on public.transaction_bond_originator_bank_offer_captures;
create trigger trg_bond_originator_bank_offer_notifications_phase6
after insert or update on public.transaction_bond_originator_bank_offer_captures
for each row execute function public.bridge_handle_bond_originator_notifications_phase6();

drop trigger if exists trg_bond_originator_grant_notifications_phase6
  on public.transaction_bond_originator_grant_captures;
create trigger trg_bond_originator_grant_notifications_phase6
after insert or update on public.transaction_bond_originator_grant_captures
for each row execute function public.bridge_handle_bond_originator_notifications_phase6();

drop trigger if exists trg_bond_delivery_attempt_notifications_phase6
  on public.transaction_bond_application_delivery_attempts;
create trigger trg_bond_delivery_attempt_notifications_phase6
after insert or update on public.transaction_bond_application_delivery_attempts
for each row execute function public.bridge_handle_bond_originator_notifications_phase6();

drop trigger if exists trg_bond_bank_outcome_notifications_phase6
  on public.transaction_bond_bank_outcomes;
create trigger trg_bond_bank_outcome_notifications_phase6
after insert or update on public.transaction_bond_bank_outcomes
for each row execute function public.bridge_handle_bond_originator_notifications_phase6();

drop trigger if exists trg_bond_submission_notifications_phase6
  on public.transaction_bond_application_submissions;
create trigger trg_bond_submission_notifications_phase6
after insert or update on public.transaction_bond_application_submissions
for each row execute function public.bridge_handle_bond_originator_notifications_phase6();

create or replace function public.bridge_handle_attorney_assignment_notifications_phase6()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_instruction text := lower(coalesce(to_jsonb(new)->>'instruction_status', ''));
  v_old_instruction text := lower(coalesce(to_jsonb(old)->>'instruction_status', ''));
  v_assignment text := lower(coalesce(to_jsonb(new)->>'assignment_status', to_jsonb(new)->>'status', ''));
  v_old_assignment text := lower(coalesce(to_jsonb(old)->>'assignment_status', to_jsonb(old)->>'status', ''));
  v_key text := 'attorney_assignment_changed';
  v_role text := coalesce(to_jsonb(new)->>'attorney_role', to_jsonb(new)->>'assignment_type', 'attorney');
begin
  if tg_op = 'UPDATE'
    and v_instruction is not distinct from v_old_instruction
    and v_assignment is not distinct from v_old_assignment
    and (to_jsonb(new)->>'attorney_user_id') is not distinct from (to_jsonb(old)->>'attorney_user_id') then
    return new;
  end if;

  if v_instruction in ('ready_for_acceptance', 'ready', 'sent') then
    v_key := 'attorney_instruction_ready';
  elsif v_instruction = 'accepted' then
    v_key := 'attorney_instruction_accepted';
  elsif v_instruction = 'declined' then
    v_key := 'attorney_instruction_declined';
  end if;

  perform public.bridge_queue_bond_attorney_legal_event_phase6(
    v_key,
    new.transaction_id,
    public.bridge_phase6_title_case(v_key),
    public.bridge_phase6_title_case(v_role) || ' instruction status is ' || public.bridge_phase6_title_case(coalesce(nullif(v_instruction, ''), v_assignment)) || '.',
    v_key || ':transaction-attorney-assignment:' || new.id::text || ':' || coalesce(nullif(v_instruction, ''), v_assignment, 'event'),
    jsonb_strip_nulls(jsonb_build_object(
      'workflowLabel', public.bridge_phase6_title_case(v_role),
      'status', public.bridge_phase6_title_case(coalesce(nullif(v_instruction, ''), v_assignment)),
      'previousStatus', public.bridge_phase6_title_case(coalesce(nullif(v_old_instruction, ''), v_old_assignment)),
      'reason', to_jsonb(new)->>'instruction_decision_note',
      'nextAction', case when v_key = 'attorney_instruction_declined' then 'Review attorney reassignment.' else null end
    )),
    'transaction_attorney_assignments'
  );

  return new;
end;
$$;

drop trigger if exists trg_attorney_assignment_notifications_phase6
  on public.transaction_attorney_assignments;
create trigger trg_attorney_assignment_notifications_phase6
after insert or update on public.transaction_attorney_assignments
for each row execute function public.bridge_handle_attorney_assignment_notifications_phase6();

create or replace function public.bridge_handle_attorney_financial_publication_notifications_phase6()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.action <> 'published' then
    return new;
  end if;

  perform public.bridge_queue_bond_attorney_legal_event_phase6(
    'attorney_client_financial_document_published',
    new.transaction_id,
    'Client financial document published',
    'An attorney financial document was published to the ' || new.recipient_role || ' portal.',
    'attorney-client-financial-document-published:' || new.id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'workflowLabel', 'Attorney Client Financial Documents',
      'status', public.bridge_phase6_title_case(new.action),
      'documentTitle', new.document_definition_key,
      'partyName', public.bridge_phase6_title_case(new.recipient_role)
    )),
    'attorney_client_financial_document_publication_events'
  );

  return new;
end;
$$;

drop trigger if exists trg_attorney_financial_publication_notifications_phase6
  on public.attorney_client_financial_document_publication_events;
create trigger trg_attorney_financial_publication_notifications_phase6
after insert on public.attorney_client_financial_document_publication_events
for each row execute function public.bridge_handle_attorney_financial_publication_notifications_phase6();

create or replace function public.bridge_handle_legal_packet_event_notifications_phase6()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_packet public.document_packets%rowtype;
  v_key text := '';
  v_payload jsonb := coalesce(new.event_payload_json, '{}'::jsonb);
  v_event_type text := lower(coalesce(new.event_type, ''));
  v_signer_name text := coalesce(v_payload->>'signerName', v_payload->>'signer_name', v_payload->>'recipientName');
  v_signer_role text := coalesce(v_payload->>'signerRole', v_payload->>'signer_role', v_payload->>'targetSignerRole');
  v_reason text := coalesce(v_payload->>'error', v_payload->>'errorSummary', v_payload->>'reason');
begin
  if v_event_type in ('version_created', 'render_freeze_completed', 'native_pdf_certified') then
    v_key := 'legal_packet_generated';
  elsif v_event_type in ('signing_dispatch_delivered', 'signing_dispatch_authorized') then
    v_key := 'legal_packet_sent_for_signing';
  elsif v_event_type in ('signing_dispatch_failed') then
    v_key := 'legal_signing_dispatch_failed';
  elsif v_event_type in ('signer_viewed', 'signing_session_viewed', 'seller_viewed_mandate') then
    v_key := 'legal_signer_viewed';
  elsif v_event_type in ('signer_signed', 'signer_completed', 'signature_completed') then
    v_key := 'legal_signer_signed';
  elsif v_event_type in ('packet_completed', 'final_signed_artifact_published', 'final_transaction_publication_completed') then
    v_key := 'legal_packet_completed';
  end if;

  if v_key = '' then
    return new;
  end if;

  select * into v_packet
  from public.document_packets
  where id = new.packet_id
  limit 1;

  if v_packet.id is null or v_packet.transaction_id is null then
    return new;
  end if;

  perform public.bridge_queue_bond_attorney_legal_event_phase6(
    v_key,
    v_packet.transaction_id,
    public.bridge_phase6_title_case(v_key),
    public.bridge_phase6_title_case(v_event_type) || ' for ' || coalesce(nullif(v_packet.title, ''), public.bridge_phase6_title_case(v_packet.packet_type)) || '.',
    v_key || ':document-packet-event:' || new.id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'workflowLabel', 'Legal Documents',
      'status', public.bridge_phase6_title_case(v_event_type),
      'packetId', v_packet.id,
      'packetTitle', v_packet.title,
      'packetType', v_packet.packet_type,
      'signerName', v_signer_name,
      'signerRole', public.bridge_phase6_title_case(v_signer_role),
      'reason', v_reason,
      'nextAction', case when v_key = 'legal_signing_dispatch_failed' then 'Confirm the signer email and resend the packet.' else null end
    )),
    'document_packet_events'
  );

  return new;
end;
$$;

drop trigger if exists trg_legal_packet_event_notifications_phase6
  on public.document_packet_events;
create trigger trg_legal_packet_event_notifications_phase6
after insert on public.document_packet_events
for each row execute function public.bridge_handle_legal_packet_event_notifications_phase6();

create or replace function public.bridge_handle_legal_job_notifications_phase6()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_packet public.document_packets%rowtype;
begin
  if coalesce(new.status, '') <> 'failed'
    or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then
    return new;
  end if;

  select * into v_packet
  from public.document_packets
  where id = new.packet_id
  limit 1;

  if v_packet.id is null or v_packet.transaction_id is null then
    return new;
  end if;

  perform public.bridge_queue_bond_attorney_legal_event_phase6(
    'legal_signing_dispatch_failed',
    v_packet.transaction_id,
    'Legal workflow job failed',
    'Legal workflow job ' || new.job_type || ' failed.',
    'legal-job-failed:' || new.id::text || ':' || coalesce(new.failed_at, now())::text,
    jsonb_strip_nulls(jsonb_build_object(
      'workflowLabel', 'Legal Documents',
      'status', 'Failed',
      'packetId', v_packet.id,
      'packetTitle', v_packet.title,
      'packetType', v_packet.packet_type,
      'reason', coalesce(new.error_json->>'message', new.error_json->>'error', to_jsonb(new)->>'failure_stage'),
      'nextAction', 'Review the legal document job and retry or escalate.'
    )),
    'legal_document_jobs'
  );

  return new;
end;
$$;

drop trigger if exists trg_legal_job_notifications_phase6
  on public.legal_document_jobs;
create trigger trg_legal_job_notifications_phase6
after insert or update on public.legal_document_jobs
for each row execute function public.bridge_handle_legal_job_notifications_phase6();

create or replace function public.bridge_claim_bond_attorney_legal_notifications_phase6(
  p_transaction_id uuid default null,
  p_event_id uuid default null,
  p_limit integer default 25
)
returns setof public.notification_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimable as (
    select event.id
    from public.notification_events event
    where event.automation_key in (
        'bond_application_submitted',
        'bond_application_status_changed',
        'bond_additional_documents_requested',
        'bond_document_uploaded',
        'bond_bank_offer_received',
        'bond_bank_offer_buyer_decision',
        'bond_grant_received',
        'bond_grant_published',
        'bond_delivery_failed',
        'attorney_instruction_ready',
        'attorney_instruction_accepted',
        'attorney_instruction_declined',
        'attorney_assignment_changed',
        'attorney_matter_stage_changed',
        'attorney_client_financial_document_published',
        'legal_packet_generated',
        'legal_packet_sent_for_signing',
        'legal_signer_viewed',
        'legal_signer_signed',
        'legal_packet_completed',
        'legal_signing_dispatch_failed'
      )
      and event.channel = 'email'
      and event.status in ('queued', 'failed')
      and coalesce(event.dispatch_attempt_count, 0) < coalesce(event.max_dispatch_attempts, 5)
      and coalesce(event.next_dispatch_attempt_at, now()) <= now()
      and (p_transaction_id is null or event.transaction_id = p_transaction_id)
      and (p_event_id is null or event.id = p_event_id)
    order by event.queued_at asc nulls last, event.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.notification_events event
  set status = 'processing',
      dispatch_attempt_count = coalesce(event.dispatch_attempt_count, 0) + 1,
      last_dispatch_attempt_at = now(),
      last_dispatch_error = null
  from claimable
  where event.id = claimable.id
  returning event.*;
end;
$$;

revoke all on function public.bridge_queue_bond_attorney_legal_event_phase6(text, uuid, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.bridge_claim_bond_attorney_legal_notifications_phase6(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.bridge_queue_bond_attorney_legal_event_phase6(text, uuid, text, text, text, jsonb, text) to authenticated, service_role;
grant execute on function public.bridge_claim_bond_attorney_legal_notifications_phase6(uuid, uuid, integer) to service_role;

comment on function public.bridge_queue_bond_attorney_legal_event_phase6(text, uuid, text, text, text, jsonb, text) is
  'Phase 6 queues branded bond, attorney and legal workflow notification email events.';
comment on function public.bridge_claim_bond_attorney_legal_notifications_phase6(uuid, uuid, integer) is
  'Phase 6 claims queued bond, attorney and legal workflow notification_events for the send-email dispatcher.';

notify pgrst, 'reload schema';
commit;
