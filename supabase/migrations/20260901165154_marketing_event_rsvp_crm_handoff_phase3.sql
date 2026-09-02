-- Phase 3: durable RSVP-to-CRM handoff. Public submission only queues work;
-- a trusted internal worker processes the queue through the existing CRM service.

alter table public.marketing_event_rsvps
  add column crm_lead_id uuid,
  add column crm_contact_id uuid,
  add column crm_processed_at timestamptz,
  add column crm_error text;

create table public.marketing_event_rsvp_handoffs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_id uuid not null references public.marketing_events(id) on delete cascade,
  rsvp_id uuid not null unique references public.marketing_event_rsvps(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'processed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marketing_event_rsvp_handoffs_queue_idx on public.marketing_event_rsvp_handoffs (status, created_at);
alter table public.marketing_event_rsvp_handoffs enable row level security;
revoke all on public.marketing_event_rsvp_handoffs from anon;
grant select, update on public.marketing_event_rsvp_handoffs to authenticated;

create policy marketing_event_rsvp_handoffs_select_scoped on public.marketing_event_rsvp_handoffs for select to authenticated using (public.bridge_has_organisation_membership(organisation_id));
create policy marketing_event_rsvp_handoffs_update_scoped on public.marketing_event_rsvp_handoffs for update to authenticated using (public.bridge_has_organisation_membership(organisation_id)) with check (public.bridge_has_organisation_membership(organisation_id));

create or replace function public.marketing_event_rsvp_queue_handoff()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_organisation_id uuid;
begin
  select organisation_id into v_organisation_id from public.marketing_events where id = new.event_id;
  insert into public.marketing_event_rsvp_handoffs (organisation_id, event_id, rsvp_id, status)
  values (v_organisation_id, new.event_id, new.id, 'queued')
  on conflict (rsvp_id) do update set status = case when public.marketing_event_rsvp_handoffs.status = 'processed' then 'processed' else 'queued' end, last_error = null, updated_at = now();
  return new;
end;
$$;

create trigger marketing_event_rsvp_queue_handoff
after insert or update of full_name, email, mobile, guest_count, note, status on public.marketing_event_rsvps
for each row when (new.status = 'confirmed') execute function public.marketing_event_rsvp_queue_handoff();

revoke execute on function public.marketing_event_rsvp_queue_handoff() from public, anon, authenticated;
