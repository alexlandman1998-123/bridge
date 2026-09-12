-- Phase 9: make the marketing-event worker recoverable and observable.
-- Queue rows remain organisation-scoped through the existing RLS policies.

alter table public.marketing_event_rsvp_handoffs
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists failed_at timestamptz;

alter table public.marketing_event_rsvp_messages
  add column if not exists next_attempt_at timestamptz,
  add column if not exists failed_at timestamptz;

update public.marketing_event_rsvp_handoffs
set next_attempt_at = coalesce(next_attempt_at, created_at, now())
where status = 'queued' and next_attempt_at is null;

update public.marketing_event_rsvp_messages
set next_attempt_at = coalesce(next_attempt_at, scheduled_for, created_at, now())
where status = 'queued' and next_attempt_at is null;

create index if not exists marketing_event_rsvp_handoffs_retry_queue_idx
  on public.marketing_event_rsvp_handoffs (status, next_attempt_at, created_at)
  where status = 'queued';

create index if not exists marketing_event_rsvp_messages_retry_queue_idx
  on public.marketing_event_rsvp_messages (status, next_attempt_at, scheduled_for)
  where status = 'queued';

create or replace view public.marketing_event_operations_summary
with (security_invoker = true)
as
select
  e.organisation_id,
  e.id as event_id,
  coalesce(r.confirmed_rsvps, 0) as confirmed_rsvps,
  coalesce(r.checked_in_rsvps, 0) as checked_in_rsvps,
  coalesce(h.queued_handoffs, 0) as queued_handoffs,
  coalesce(h.failed_handoffs, 0) as failed_handoffs,
  coalesce(m.queued_messages, 0) as queued_messages,
  coalesce(m.failed_messages, 0) as failed_messages
from public.marketing_events e
left join lateral (
  select count(*) filter (where status = 'confirmed') as confirmed_rsvps,
         count(*) filter (where checked_in_at is not null) as checked_in_rsvps
  from public.marketing_event_rsvps where event_id = e.id
) r on true
left join lateral (
  select count(*) filter (where status = 'queued') as queued_handoffs,
         count(*) filter (where status = 'failed') as failed_handoffs
  from public.marketing_event_rsvp_handoffs where event_id = e.id
) h on true
left join lateral (
  select count(*) filter (where status = 'queued') as queued_messages,
         count(*) filter (where status = 'failed') as failed_messages
  from public.marketing_event_rsvp_messages where event_id = e.id
) m on true;

grant select on public.marketing_event_operations_summary to authenticated;
