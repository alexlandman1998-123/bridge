create table if not exists public.notification_automation_definitions (
  automation_key text primary key,
  display_name text not null,
  category text not null,
  trigger_type text not null,
  recipient_role text,
  channels text[] not null default array['email']::text[],
  implementation_status text not null default 'planned',
  default_enabled boolean not null default false,
  dedupe_strategy text not null default 'event_recipient_entity',
  reminder_policy jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_automation_definitions_category_check
    check (category in ('standard_email', 'notification', 'reminder')),
  constraint notification_automation_definitions_trigger_check
    check (trigger_type in ('manual_send', 'system_event', 'scheduled_reminder')),
  constraint notification_automation_definitions_status_check
    check (implementation_status in ('active', 'planned', 'disabled'))
);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  automation_key text references public.notification_automation_definitions(automation_key)
    on update cascade
    on delete set null,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  assigned_user_id uuid,
  lead_id uuid references public.leads(lead_id) on delete set null,
  listing_id uuid references public.private_listings(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  offer_id uuid references public.offers(id) on delete set null,
  appointment_id uuid references public.appointments(appointment_id) on delete set null,
  portal_session_id uuid references public.offer_portal_sessions(id) on delete set null,
  seller_review_session_id uuid references public.offer_seller_review_sessions(id) on delete set null,
  communication_delivery_id uuid,
  transaction_notification_id uuid,
  event_key text not null,
  category text not null,
  trigger_type text not null,
  channel text not null default 'email',
  status text not null default 'prepared',
  recipient_email text,
  recipient_role text,
  subject text,
  message_preview text,
  provider text,
  provider_message_id text,
  error_message text,
  source text not null default 'notification_automation',
  dedupe_key text,
  payload_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  prepared_at timestamptz not null default now(),
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_events_category_check
    check (category in ('standard_email', 'notification', 'reminder')),
  constraint notification_events_trigger_check
    check (trigger_type in ('manual_send', 'system_event', 'scheduled_reminder')),
  constraint notification_events_channel_check
    check (channel in ('email', 'in_app', 'whatsapp', 'sms')),
  constraint notification_events_status_check
    check (status in ('prepared', 'queued', 'sent', 'delivered', 'failed', 'skipped')),
  constraint notification_events_recipient_check
    check (recipient_email is null or length(trim(recipient_email)) > 0)
);

alter table if exists public.communication_deliveries
  add column if not exists notification_event_id uuid references public.notification_events(id) on delete set null,
  add column if not exists automation_key text references public.notification_automation_definitions(automation_key)
    on update cascade
    on delete set null;

create index if not exists notification_events_org_idx
  on public.notification_events (organisation_id, created_at desc);

create index if not exists notification_events_automation_idx
  on public.notification_events (organisation_id, automation_key, created_at desc);

create index if not exists notification_events_status_idx
  on public.notification_events (organisation_id, status, created_at desc);

create index if not exists notification_events_transaction_idx
  on public.notification_events (organisation_id, transaction_id, created_at desc);

create index if not exists notification_events_lead_idx
  on public.notification_events (organisation_id, lead_id, created_at desc);

create index if not exists notification_events_listing_idx
  on public.notification_events (organisation_id, listing_id, created_at desc);

create index if not exists notification_events_dedupe_idx
  on public.notification_events (organisation_id, dedupe_key, created_at desc)
  where dedupe_key is not null;

create index if not exists communication_deliveries_notification_event_idx
  on public.communication_deliveries (organisation_id, notification_event_id, created_at desc);

create index if not exists communication_deliveries_automation_idx
  on public.communication_deliveries (organisation_id, automation_key, created_at desc);

create or replace function public.bridge_notification_automation_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_notification_automation_definitions_updated_at
  on public.notification_automation_definitions;
create trigger trg_notification_automation_definitions_updated_at
before update on public.notification_automation_definitions
for each row execute function public.bridge_notification_automation_set_updated_at();

drop trigger if exists trg_notification_events_updated_at
  on public.notification_events;
create trigger trg_notification_events_updated_at
before update on public.notification_events
for each row execute function public.bridge_notification_automation_set_updated_at();

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
values
  (
    'buyer_onboarding_sent',
    'Buyer onboarding email sent',
    'standard_email',
    'manual_send',
    'buyer',
    array['email']::text[],
    'active',
    true,
    'transaction_recipient_latest',
    '{}'::jsonb,
    '{"communicationTypes":["client_onboarding"],"phase":"phase_1_foundation"}'::jsonb
  ),
  (
    'seller_onboarding_sent',
    'Seller onboarding email sent',
    'standard_email',
    'manual_send',
    'seller',
    array['email']::text[],
    'active',
    true,
    'listing_recipient_latest',
    '{}'::jsonb,
    '{"communicationTypes":["seller_onboarding_link_seller"],"phase":"phase_1_foundation"}'::jsonb
  ),
  (
    'buyer_portal_sent',
    'Buyer portal email sent',
    'standard_email',
    'manual_send',
    'buyer',
    array['email']::text[],
    'active',
    true,
    'transaction_recipient_latest',
    '{}'::jsonb,
    '{"communicationTypes":["client_portal_link"],"phase":"phase_1_foundation"}'::jsonb
  ),
  (
    'seller_portal_sent',
    'Seller portal email sent',
    'standard_email',
    'manual_send',
    'seller',
    array['email']::text[],
    'active',
    true,
    'listing_recipient_latest',
    '{}'::jsonb,
    '{"communicationTypes":["seller_portal_link_seller"],"phase":"phase_1_foundation"}'::jsonb
  ),
  (
    'attorney_invite_sent',
    'Attorney invite email sent',
    'standard_email',
    'manual_send',
    'attorney',
    array['email']::text[],
    'active',
    true,
    'transaction_role_recipient_latest',
    '{}'::jsonb,
    '{"communicationTypes":["transaction_partner_invitation"],"roleTypes":["transfer_attorney","bond_attorney","cancellation_attorney"],"phase":"phase_1_foundation"}'::jsonb
  ),
  (
    'bond_originator_invite_sent',
    'Bond originator invite email sent',
    'standard_email',
    'manual_send',
    'bond_originator',
    array['email']::text[],
    'active',
    true,
    'transaction_role_recipient_latest',
    '{}'::jsonb,
    '{"communicationTypes":["transaction_partner_invitation"],"roleTypes":["bond_originator"],"phase":"phase_1_foundation"}'::jsonb
  ),
  (
    'agent_invite_sent',
    'Agent invite email sent',
    'standard_email',
    'manual_send',
    'agent',
    array['email']::text[],
    'active',
    true,
    'organisation_recipient_latest',
    '{}'::jsonb,
    '{"communicationTypes":["agent_invite","workspace_invite","branch_invite"],"phase":"phase_1_foundation"}'::jsonb
  ),
  (
    'buyer_onboarding_submitted',
    'Buyer onboarding submitted',
    'notification',
    'system_event',
    'agent',
    array['email','in_app']::text[],
    'active',
    true,
    'transaction_event_once',
    '{}'::jsonb,
    '{"communicationTypes":["onboarding_submitted"],"phase":"phase_1_foundation"}'::jsonb
  ),
  (
    'seller_onboarding_submitted',
    'Seller onboarding submitted',
    'notification',
    'system_event',
    'agent',
    array['email','in_app']::text[],
    'active',
    true,
    'listing_event_once',
    '{}'::jsonb,
    '{"communicationTypes":["seller_onboarding_submitted_agent"],"phase":"phase_1_foundation"}'::jsonb
  ),
  (
    'attorney_invite_accepted',
    'Attorney invite accepted',
    'notification',
    'system_event',
    'agent',
    array['email','in_app']::text[],
    'planned',
    false,
    'transaction_role_event_once',
    '{}'::jsonb,
    '{"acceptanceSource":"transaction_partner_invitations","phase":"phase_1_foundation"}'::jsonb
  ),
  (
    'bond_originator_invite_accepted',
    'Bond originator invite accepted',
    'notification',
    'system_event',
    'agent',
    array['email','in_app']::text[],
    'planned',
    false,
    'transaction_role_event_once',
    '{}'::jsonb,
    '{"acceptanceSource":"transaction_partner_invitations","phase":"phase_1_foundation"}'::jsonb
  ),
  (
    'agent_invite_accepted',
    'Agent invite accepted',
    'notification',
    'system_event',
    'admin',
    array['email','in_app']::text[],
    'planned',
    false,
    'organisation_user_event_once',
    '{}'::jsonb,
    '{"acceptanceSource":"workspace_invites","phase":"phase_1_foundation"}'::jsonb
  ),
  (
    'buyer_onboarding_reminder',
    'Buyer onboarding reminder',
    'reminder',
    'scheduled_reminder',
    'buyer',
    array['email']::text[],
    'planned',
    false,
    'transaction_recipient_reminder_window',
    '{"cadenceDays":[2,5,9],"stopWhen":"buyer_onboarding_submitted"}'::jsonb,
    '{"phase":"phase_1_foundation"}'::jsonb
  ),
  (
    'seller_onboarding_reminder',
    'Seller onboarding reminder',
    'reminder',
    'scheduled_reminder',
    'seller',
    array['email']::text[],
    'planned',
    false,
    'listing_recipient_reminder_window',
    '{"cadenceDays":[2,5,9],"stopWhen":"seller_onboarding_submitted"}'::jsonb,
    '{"phase":"phase_1_foundation"}'::jsonb
  ),
  (
    'attorney_invite_reminder',
    'Attorney invite reminder',
    'reminder',
    'scheduled_reminder',
    'attorney',
    array['email']::text[],
    'planned',
    false,
    'transaction_role_recipient_reminder_window',
    '{"cadenceDays":[2,5,9],"stopWhen":"attorney_invite_accepted"}'::jsonb,
    '{"phase":"phase_1_foundation"}'::jsonb
  ),
  (
    'bond_originator_invite_reminder',
    'Bond originator invite reminder',
    'reminder',
    'scheduled_reminder',
    'bond_originator',
    array['email']::text[],
    'planned',
    false,
    'transaction_role_recipient_reminder_window',
    '{"cadenceDays":[2,5,9],"stopWhen":"bond_originator_invite_accepted"}'::jsonb,
    '{"phase":"phase_1_foundation"}'::jsonb
  ),
  (
    'agent_invite_reminder',
    'Agent invite reminder',
    'reminder',
    'scheduled_reminder',
    'agent',
    array['email']::text[],
    'planned',
    false,
    'organisation_recipient_reminder_window',
    '{"cadenceDays":[2,5,9],"stopWhen":"agent_invite_accepted"}'::jsonb,
    '{"phase":"phase_1_foundation"}'::jsonb
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

alter table public.notification_automation_definitions enable row level security;
alter table public.notification_events enable row level security;

drop policy if exists notification_automation_definitions_select on public.notification_automation_definitions;
create policy notification_automation_definitions_select
  on public.notification_automation_definitions
  for select
  to authenticated
  using (true);

drop policy if exists notification_events_select_member on public.notification_events;
create policy notification_events_select_member
  on public.notification_events
  for select
  to authenticated
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists notification_events_insert_member on public.notification_events;
create policy notification_events_insert_member
  on public.notification_events
  for insert
  to authenticated
  with check (public.bridge_is_active_member(organisation_id));

drop policy if exists notification_events_update_member on public.notification_events;
create policy notification_events_update_member
  on public.notification_events
  for update
  to authenticated
  using (public.bridge_is_active_member(organisation_id))
  with check (public.bridge_is_active_member(organisation_id));

grant select on public.notification_automation_definitions to authenticated;
grant select, insert, update on public.notification_events to authenticated;

comment on table public.notification_automation_definitions is
  'Canonical notification automation contract: standard emails, event notifications, and reminders.';

comment on table public.notification_events is
  'Audit log for notification automations and their delivery outcomes.';
