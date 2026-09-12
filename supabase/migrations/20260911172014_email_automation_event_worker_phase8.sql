begin;

create table if not exists public.email_automation_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  contact_id uuid not null references public.email_marketing_contacts(id) on delete cascade,
  event_key text not null check (event_key in ('contact_created', 'listing_enquiry', 'tag_added', 'price_reduction', 'manual')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'processing', 'processed', 'failed')),
  attempts integer not null default 0,
  next_run_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists email_automation_events_due_idx on public.email_automation_events (next_run_at, created_at) where status = 'queued';

alter table public.email_automation_enrolments
  add column if not exists enrolment_key text not null default 'once',
  add column if not exists locked_at timestamptz,
  add column if not exists attempts integer not null default 0,
  add column if not exists last_error text;
create unique index if not exists email_automation_enrolments_idempotency_idx
  on public.email_automation_enrolments (journey_id, contact_id, enrolment_key);

create table if not exists public.email_automation_deliveries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  enrolment_id uuid not null unique references public.email_automation_enrolments(id) on delete cascade,
  campaign_id uuid not null references public.email_campaigns(id) on delete restrict,
  contact_id uuid not null references public.email_marketing_contacts(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'sent', 'suppressed', 'failed')),
  attempts integer not null default 0,
  next_run_at timestamptz not null default now(),
  locked_at timestamptz,
  provider_message_id text unique,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists email_automation_deliveries_due_idx on public.email_automation_deliveries (next_run_at, created_at) where status = 'queued';

alter table public.email_automation_events enable row level security;
alter table public.email_automation_deliveries enable row level security;
grant select on public.email_automation_events, public.email_automation_deliveries to authenticated;
create policy email_automation_events_member on public.email_automation_events for select to authenticated using (public.bridge_has_organisation_membership(organisation_id));
create policy email_automation_deliveries_member on public.email_automation_deliveries for select to authenticated using (public.bridge_has_organisation_membership(organisation_id));

create or replace function public.email_automation_enqueue_event(
  p_organisation_id uuid, p_contact_id uuid, p_event_key text, p_payload jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.bridge_has_organisation_membership(p_organisation_id)
    or not exists (select 1 from public.email_marketing_contacts where id = p_contact_id and organisation_id = p_organisation_id) then
    raise exception 'Not authorised for this automation event.' using errcode = '42501';
  end if;
  if p_event_key not in ('contact_created', 'listing_enquiry', 'tag_added', 'price_reduction', 'manual') then
    raise exception 'Unsupported automation event.' using errcode = '22023';
  end if;
  insert into public.email_automation_events (organisation_id, contact_id, event_key, payload)
  values (p_organisation_id, p_contact_id, p_event_key, coalesce(p_payload, '{}'::jsonb)) returning id into v_id;
  return v_id;
end $$;
create or replace function public.email_automation_contact_created_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.email_automation_events (organisation_id, contact_id, event_key, payload)
  values (new.organisation_id, new.id, 'contact_created', jsonb_build_object('source_type', new.source_type));
  return new;
end $$;
drop trigger if exists email_automation_contact_created_event_trigger on public.email_marketing_contacts;
create trigger email_automation_contact_created_event_trigger after insert on public.email_marketing_contacts
for each row execute function public.email_automation_contact_created_event();
create or replace function public.email_automation_tag_added_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.email_automation_events (organisation_id, contact_id, event_key, payload)
  values (new.organisation_id, new.contact_id, 'tag_added', jsonb_build_object('tag_id', new.tag_id));
  return new;
end $$;
drop trigger if exists email_automation_tag_added_event_trigger on public.email_marketing_contact_tags;
create trigger email_automation_tag_added_event_trigger after insert on public.email_marketing_contact_tags
for each row execute function public.email_automation_tag_added_event();

create or replace function public.email_automation_claim_events(p_limit integer default 25)
returns setof public.email_automation_events language sql security definer set search_path = public as $$
  with claimed as (
    select id from public.email_automation_events
    where status = 'queued' and next_run_at <= now()
    order by next_run_at, created_at for update skip locked limit greatest(1, least(p_limit, 100))
  ) update public.email_automation_events e set status = 'processing', locked_at = now(), attempts = attempts + 1
  from claimed where e.id = claimed.id returning e.*;
$$;
create or replace function public.email_automation_claim_enrolments(p_limit integer default 25)
returns setof public.email_automation_enrolments language sql security definer set search_path = public as $$
  with claimed as (
    select id from public.email_automation_enrolments
    where status in ('queued', 'waiting') and next_run_at <= now()
    order by next_run_at, created_at for update skip locked limit greatest(1, least(p_limit, 100))
  ) update public.email_automation_enrolments e set status = 'processing', locked_at = now(), attempts = attempts + 1
  from claimed where e.id = claimed.id returning e.*;
$$;
create or replace function public.email_automation_claim_deliveries(p_limit integer default 25)
returns setof public.email_automation_deliveries language sql security definer set search_path = public as $$
  with claimed as (
    select id from public.email_automation_deliveries
    where status = 'queued' and next_run_at <= now()
    order by next_run_at, created_at for update skip locked limit greatest(1, least(p_limit, 100))
  ) update public.email_automation_deliveries d set status = 'processing', locked_at = now(), attempts = attempts + 1
  from claimed where d.id = claimed.id returning d.*;
$$;
create or replace function public.email_automation_enrol(
  p_journey_id uuid, p_contact_id uuid, p_event_id uuid, p_payload jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_journey public.email_automation_journeys%rowtype; v_key text; v_id uuid;
begin
  select * into v_journey from public.email_automation_journeys where id = p_journey_id and status = 'active';
  if not found or not exists (select 1 from public.email_marketing_contacts c where c.id = p_contact_id and c.organisation_id = v_journey.organisation_id) then return null; end if;
  v_key := case when v_journey.reentry_policy = 'once' then 'once' else p_event_id::text end;
  insert into public.email_automation_enrolments (organisation_id, journey_id, contact_id, enrolment_key, source_event)
  values (v_journey.organisation_id, v_journey.id, p_contact_id, v_key, coalesce(p_payload, '{}'::jsonb))
  on conflict (journey_id, contact_id, enrolment_key) do nothing returning id into v_id;
  return v_id;
end $$;

revoke all on function public.email_automation_claim_events(integer), public.email_automation_claim_enrolments(integer), public.email_automation_claim_deliveries(integer), public.email_automation_enrol(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.email_automation_claim_events(integer), public.email_automation_claim_enrolments(integer), public.email_automation_claim_deliveries(integer), public.email_automation_enrol(uuid, uuid, uuid, jsonb) to service_role;
revoke all on function public.email_automation_enqueue_event(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.email_automation_enqueue_event(uuid, uuid, text, jsonb) to authenticated;
revoke all on function public.email_automation_contact_created_event(), public.email_automation_tag_added_event() from public, anon, authenticated;
commit;
