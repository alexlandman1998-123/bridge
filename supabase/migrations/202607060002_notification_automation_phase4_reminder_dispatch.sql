begin;

update public.notification_automation_definitions
   set metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
         jsonb_build_object('phase', 'phase_4_reminder_dispatch'),
       updated_at = now()
 where automation_key in (
   'buyer_onboarding_reminder',
   'seller_onboarding_reminder',
   'attorney_invite_reminder',
   'bond_originator_invite_reminder',
   'agent_invite_reminder'
 );

alter table if exists public.notification_events
  add column if not exists dispatch_attempt_count integer not null default 0,
  add column if not exists last_dispatch_attempt_at timestamptz,
  add column if not exists last_dispatch_error text;

alter table if exists public.notification_events
  drop constraint if exists notification_events_status_check;

alter table if exists public.notification_events
  add constraint notification_events_status_check
    check (status in ('prepared', 'queued', 'processing', 'sent', 'delivered', 'failed', 'skipped'));

create index if not exists notification_events_reminder_dispatch_queue_idx
  on public.notification_events (queued_at asc nulls last, created_at asc)
  where category = 'reminder'
    and trigger_type = 'scheduled_reminder'
    and channel = 'email'
    and status = 'queued';

create index if not exists notification_events_reminder_processing_idx
  on public.notification_events (last_dispatch_attempt_at asc nulls first, created_at asc)
  where category = 'reminder'
    and trigger_type = 'scheduled_reminder'
    and channel = 'email'
    and status = 'processing';

create or replace function public.bridge_reset_stale_notification_reminder_processing_phase4(
  p_before timestamptz default now() - interval '15 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reset_count integer := 0;
begin
  update public.notification_events
     set status = 'queued',
         last_dispatch_error = null,
         metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
           jsonb_build_object(
             'phase', 'phase_4_reminder_dispatch',
             'staleProcessingResetAt', now()
           ),
         updated_at = now()
   where category = 'reminder'
     and trigger_type = 'scheduled_reminder'
     and channel = 'email'
     and status = 'processing'
     and coalesce(last_dispatch_attempt_at, created_at) < coalesce(p_before, now() - interval '15 minutes');

  get diagnostics v_reset_count = row_count;
  return v_reset_count;
end;
$$;

create or replace function public.bridge_claim_notification_reminder_events_phase4(
  p_limit integer default 25,
  p_event_id uuid default null
)
returns setof public.notification_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(0, least(coalesce(p_limit, 25), 100));
begin
  return query
  with next_events as (
    select id
    from public.notification_events
    where category = 'reminder'
      and trigger_type = 'scheduled_reminder'
      and channel = 'email'
      and status = 'queued'
      and automation_key in (
        'buyer_onboarding_reminder',
        'seller_onboarding_reminder',
        'attorney_invite_reminder',
        'bond_originator_invite_reminder',
        'agent_invite_reminder'
      )
      and recipient_email is not null
      and (p_event_id is null or id = p_event_id)
    order by queued_at asc nulls last, created_at asc
    limit v_limit
    for update skip locked
  )
  update public.notification_events event
     set status = 'processing',
         dispatch_attempt_count = coalesce(event.dispatch_attempt_count, 0) + 1,
         last_dispatch_attempt_at = now(),
         last_dispatch_error = null,
         metadata_json = coalesce(event.metadata_json, '{}'::jsonb) ||
           jsonb_build_object(
             'phase', 'phase_4_reminder_dispatch',
             'dispatchClaimedAt', now()
           ),
         updated_at = now()
    from next_events
   where event.id = next_events.id
  returning event.*;
end;
$$;

grant execute on function public.bridge_reset_stale_notification_reminder_processing_phase4(timestamptz) to service_role;
grant execute on function public.bridge_claim_notification_reminder_events_phase4(integer, uuid) to service_role;

comment on function public.bridge_claim_notification_reminder_events_phase4(integer, uuid) is
  'Atomically claims queued notification reminder events for the Phase 4 email dispatcher.';

comment on function public.bridge_reset_stale_notification_reminder_processing_phase4(timestamptz) is
  'Returns stale processing reminder events to queued so the Phase 4 dispatcher can retry after an interrupted run.';

commit;
