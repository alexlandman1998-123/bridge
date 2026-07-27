begin;

alter table if exists public.organisations
  add column if not exists automatic_lead_acknowledgement_enabled boolean not null default true,
  add column if not exists lead_acknowledgement_sender_name text,
  add column if not exists lead_acknowledgement_reply_to_mode text not null default 'assigned_agent',
  add column if not exists lead_acknowledgement_response_expectation text not null default 'as_soon_as_possible',
  add column if not exists lead_acknowledgement_custom_response_text text;

alter table if exists public.organisations
  drop constraint if exists organisations_lead_acknowledgement_reply_to_mode_check;

alter table if exists public.organisations
  add constraint organisations_lead_acknowledgement_reply_to_mode_check
  check (lead_acknowledgement_reply_to_mode in ('assigned_agent', 'branch', 'organisation'));

alter table if exists public.organisations
  drop constraint if exists organisations_lead_acknowledgement_response_expectation_check;

alter table if exists public.organisations
  add constraint organisations_lead_acknowledgement_response_expectation_check
  check (lead_acknowledgement_response_expectation in ('as_soon_as_possible', 'within_business_day', 'within_two_hours', 'custom'));

alter table if exists public.leads
  add column if not exists acknowledgement_status text,
  add column if not exists acknowledgement_sent_at timestamptz,
  add column if not exists acknowledgement_message_id text,
  add column if not exists acknowledgement_failure_reason text,
  add column if not exists acknowledgement_attempt_count integer not null default 0;

alter table if exists public.leads
  drop constraint if exists leads_acknowledgement_status_check;

alter table if exists public.leads
  add constraint leads_acknowledgement_status_check
  check (
    acknowledgement_status is null
    or acknowledgement_status in ('pending', 'queued', 'sent', 'failed', 'skipped')
  );

create index if not exists leads_acknowledgement_status_idx
  on public.leads (organisation_id, acknowledgement_status, updated_at desc)
  where acknowledgement_status is not null;

create unique index if not exists notification_events_lead_acknowledgement_dedupe_idx
  on public.notification_events (organisation_id, dedupe_key)
  where automation_key = 'lead_acknowledgement'
    and dedupe_key is not null;

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
  metadata_json
)
values (
  'lead_acknowledgement',
  'Lead acknowledgement email',
  'standard_email',
  'system_event',
  'lead',
  array['email']::text[],
  'active',
  true,
  'provider_message_id',
  jsonb_build_object(
    'event', 'lead.enquiry_received',
    'template', 'lead_acknowledgement',
    'futureChannels', jsonb_build_array('whatsapp')
  )
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
    metadata_json = coalesce(public.notification_automation_definitions.metadata_json, '{}'::jsonb) || excluded.metadata_json,
    updated_at = now();

commit;
