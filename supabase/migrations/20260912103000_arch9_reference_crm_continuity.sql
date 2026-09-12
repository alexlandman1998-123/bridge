-- Phase 4: retain the immutable Arch9 listing reference through CRM activity.
-- UUID foreign keys remain the source of relational integrity; this reference is an
-- immutable, human-readable handoff value for people, documents, and integrations.

alter table public.leads
  add column if not exists arch9_listing_reference text;
alter table public.offers
  add column if not exists arch9_listing_reference text;
alter table public.appointments
  add column if not exists arch9_listing_reference text;
alter table public.appointment_viewed_listings
  add column if not exists arch9_listing_reference text;
alter table public.website_lead_submissions
  add column if not exists arch9_listing_reference text;
alter table public.notification_events
  add column if not exists arch9_listing_reference text;

comment on column public.leads.arch9_listing_reference is
  'Immutable Arch9 property reference copied from the linked listing for human-readable CRM handoffs.';
comment on column public.offers.arch9_listing_reference is
  'Immutable Arch9 property reference copied from the linked listing.';
comment on column public.appointments.arch9_listing_reference is
  'Immutable Arch9 property reference copied from the linked listing or transaction.';
comment on column public.appointment_viewed_listings.arch9_listing_reference is
  'Immutable Arch9 property reference copied from the viewed listing.';
comment on column public.website_lead_submissions.arch9_listing_reference is
  'Immutable Arch9 property reference copied from the public website enquiry listing.';
comment on column public.notification_events.arch9_listing_reference is
  'Immutable Arch9 property reference copied from the notification listing.';

create or replace function public.arch9_listing_reference_for_listing(p_listing_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select listing.arch9_reference
  from public.private_listings listing
  where listing.id = p_listing_id
$$;

create or replace function public.arch9_sync_lead_listing_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_listing_id uuid;
begin
  v_listing_id := new.enquired_listing_id;
  if v_listing_id is null and new.listing_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_listing_id := new.listing_id::uuid;
  end if;

  new.arch9_listing_reference := public.arch9_listing_reference_for_listing(v_listing_id);
  return new;
end;
$$;

create or replace function public.arch9_sync_offer_listing_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.arch9_listing_reference := public.arch9_listing_reference_for_listing(new.listing_id);
  return new;
end;
$$;

create or replace function public.arch9_sync_appointment_listing_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_listing_id uuid;
begin
  if new.listing_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_listing_id := new.listing_id::uuid;
  end if;

  new.arch9_listing_reference := public.arch9_listing_reference_for_listing(v_listing_id);
  if new.arch9_listing_reference is null and new.transaction_id is not null then
    select txn.arch9_listing_reference
      into new.arch9_listing_reference
    from public.transactions txn
    where txn.id = new.transaction_id;
  end if;
  return new;
end;
$$;

create or replace function public.arch9_sync_viewed_listing_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.arch9_listing_reference := public.arch9_listing_reference_for_listing(new.listing_id);
  return new;
end;
$$;

create or replace function public.arch9_sync_website_submission_listing_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.arch9_listing_reference := public.arch9_listing_reference_for_listing(new.listing_id);
  return new;
end;
$$;

create or replace function public.arch9_sync_notification_listing_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.arch9_listing_reference := public.arch9_listing_reference_for_listing(new.listing_id);
  return new;
end;
$$;

drop trigger if exists trg_arch9_sync_lead_listing_reference on public.leads;
create trigger trg_arch9_sync_lead_listing_reference
before insert or update of listing_id, enquired_listing_id on public.leads
for each row execute function public.arch9_sync_lead_listing_reference();

drop trigger if exists trg_arch9_sync_offer_listing_reference on public.offers;
create trigger trg_arch9_sync_offer_listing_reference
before insert or update of listing_id on public.offers
for each row execute function public.arch9_sync_offer_listing_reference();

drop trigger if exists trg_arch9_sync_appointment_listing_reference on public.appointments;
create trigger trg_arch9_sync_appointment_listing_reference
before insert or update of listing_id, transaction_id on public.appointments
for each row execute function public.arch9_sync_appointment_listing_reference();

drop trigger if exists trg_arch9_sync_viewed_listing_reference on public.appointment_viewed_listings;
create trigger trg_arch9_sync_viewed_listing_reference
before insert or update of listing_id on public.appointment_viewed_listings
for each row execute function public.arch9_sync_viewed_listing_reference();

drop trigger if exists trg_arch9_sync_website_submission_listing_reference on public.website_lead_submissions;
create trigger trg_arch9_sync_website_submission_listing_reference
before insert or update of listing_id on public.website_lead_submissions
for each row execute function public.arch9_sync_website_submission_listing_reference();

drop trigger if exists trg_arch9_sync_notification_listing_reference on public.notification_events;
create trigger trg_arch9_sync_notification_listing_reference
before insert or update of listing_id on public.notification_events
for each row execute function public.arch9_sync_notification_listing_reference();

-- Backfill only records whose existing listing already carries an Arch9 reference.
update public.leads lead
set arch9_listing_reference = listing.arch9_reference
from public.private_listings listing
where listing.arch9_reference is not null
  and lead.enquired_listing_id = listing.id
  and lead.arch9_listing_reference is distinct from listing.arch9_reference;

update public.leads lead
set arch9_listing_reference = listing.arch9_reference
from public.private_listings listing
where listing.arch9_reference is not null
  and lead.enquired_listing_id is null
  and lead.listing_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and lead.listing_id::uuid = listing.id
  and lead.arch9_listing_reference is distinct from listing.arch9_reference;

update public.offers offer
set arch9_listing_reference = listing.arch9_reference
from public.private_listings listing
where offer.listing_id = listing.id
  and listing.arch9_reference is not null
  and offer.arch9_listing_reference is distinct from listing.arch9_reference;

update public.appointment_viewed_listings viewed
set arch9_listing_reference = listing.arch9_reference
from public.private_listings listing
where viewed.listing_id = listing.id
  and listing.arch9_reference is not null
  and viewed.arch9_listing_reference is distinct from listing.arch9_reference;

update public.appointments appointment
set arch9_listing_reference = listing.arch9_reference
from public.private_listings listing
where appointment.listing_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and appointment.listing_id::uuid = listing.id
  and listing.arch9_reference is not null
  and appointment.arch9_listing_reference is distinct from listing.arch9_reference;

update public.appointments appointment
set arch9_listing_reference = txn.arch9_listing_reference
from public.transactions txn
where appointment.arch9_listing_reference is null
  and appointment.transaction_id = txn.id
  and txn.arch9_listing_reference is not null;

update public.website_lead_submissions submission
set arch9_listing_reference = listing.arch9_reference
from public.private_listings listing
where submission.listing_id = listing.id
  and listing.arch9_reference is not null
  and submission.arch9_listing_reference is distinct from listing.arch9_reference;

update public.notification_events notification
set arch9_listing_reference = listing.arch9_reference
from public.private_listings listing
where notification.listing_id = listing.id
  and listing.arch9_reference is not null
  and notification.arch9_listing_reference is distinct from listing.arch9_reference;

-- Keep the public API's explicit lead-source metadata supplied by the website.
do $$
declare
  v_definition text;
  v_old text := '''userAgent'', nullif(pg_catalog.left(coalesce(p_attribution ->> ''userAgent'', ''''), 512), '''')';
  v_new text := '''userAgent'', nullif(pg_catalog.left(coalesce(p_attribution ->> ''userAgent'', ''''), 512), ''''), ''leadSource'', nullif(pg_catalog.left(coalesce(p_attribution ->> ''leadSource'', ''''), 80), '''')';
begin
  select pg_get_functiondef(
    'public.website_capture_lead_submission(text,text,uuid,uuid,text,text,text,text,boolean,boolean,text,text,jsonb)'::regprocedure
  ) into v_definition;

  if position(v_old in v_definition) = 0 then
    raise exception 'Could not locate website lead attribution block for Arch9 reference Phase 4';
  end if;

  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end;
$$;
