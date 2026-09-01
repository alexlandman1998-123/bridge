-- Phase 7: post-event conversion state is kept on the RSVP and task creation is idempotent.
alter table public.marketing_event_rsvps
  add column conversion_outcome text check (conversion_outcome in ('attended_interested', 'attended_follow_up', 'no_show', 'cancelled', 'not_a_fit')),
  add column conversion_task_id uuid,
  add column conversion_processed_at timestamptz;

create index marketing_event_rsvps_conversion_idx on public.marketing_event_rsvps (event_id, conversion_outcome);
