-- Phase 4: transactional RSVP confirmation outbox. A unique key makes retries safe.
create table public.marketing_event_rsvp_messages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_id uuid not null references public.marketing_events(id) on delete cascade,
  rsvp_id uuid not null references public.marketing_event_rsvps(id) on delete cascade,
  crm_lead_id uuid,
  message_type text not null check (message_type in ('confirmation', 'morning_reminder')),
  channel text not null default 'email' check (channel in ('email', 'whatsapp')),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text,
  error_message text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rsvp_id, message_type, channel)
);
create index marketing_event_rsvp_messages_dispatch_idx on public.marketing_event_rsvp_messages (status, scheduled_for);
alter table public.marketing_event_rsvp_messages enable row level security;
revoke all on public.marketing_event_rsvp_messages from anon;
grant select, update on public.marketing_event_rsvp_messages to authenticated;
create policy marketing_event_rsvp_messages_select_scoped on public.marketing_event_rsvp_messages for select to authenticated using (public.bridge_has_organisation_membership(organisation_id));
create policy marketing_event_rsvp_messages_update_scoped on public.marketing_event_rsvp_messages for update to authenticated using (public.bridge_has_organisation_membership(organisation_id)) with check (public.bridge_has_organisation_membership(organisation_id));
