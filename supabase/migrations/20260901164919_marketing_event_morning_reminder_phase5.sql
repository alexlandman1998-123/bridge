-- Phase 5: queue the reminder for 08:00 in the event's local timezone.
create or replace function public.marketing_event_rsvp_queue_morning_reminder()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_event public.marketing_events%rowtype;
  v_scheduled_at timestamptz;
begin
  if new.status <> 'confirmed' then
    update public.marketing_event_rsvp_messages set status = 'cancelled', updated_at = now()
    where rsvp_id = new.id and message_type = 'morning_reminder' and status in ('queued', 'sending');
    return new;
  end if;
  select * into v_event from public.marketing_events where id = new.event_id;
  if not found or v_event.status not in ('planning', 'upcoming') or v_event.starts_at is null then return new; end if;
  v_scheduled_at := (((v_event.starts_at at time zone v_event.timezone)::date + time '08:00') at time zone v_event.timezone);
  if v_scheduled_at <= now() then return new; end if;
  insert into public.marketing_event_rsvp_messages (organisation_id, event_id, rsvp_id, crm_lead_id, message_type, channel, status, scheduled_for, idempotency_key)
  values (v_event.organisation_id, v_event.id, new.id, new.crm_lead_id, 'morning_reminder', 'email', 'queued', v_scheduled_at, 'marketing-event-rsvp:' || new.id::text || ':morning-reminder:email')
  on conflict (rsvp_id, message_type, channel) do update
    set crm_lead_id = coalesce(excluded.crm_lead_id, public.marketing_event_rsvp_messages.crm_lead_id),
        scheduled_for = excluded.scheduled_for,
        status = case
          when public.marketing_event_rsvp_messages.status = 'cancelled' then 'cancelled'
          else public.marketing_event_rsvp_messages.status
        end,
        updated_at = now();
  return new;
end;
$$;

create trigger marketing_event_rsvp_queue_morning_reminder
after insert or update of status, crm_lead_id on public.marketing_event_rsvps
for each row execute function public.marketing_event_rsvp_queue_morning_reminder();

revoke execute on function public.marketing_event_rsvp_queue_morning_reminder() from public, anon, authenticated;
