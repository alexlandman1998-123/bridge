-- Private Property phase 4: authenticated lead intake and show-day delivery ledger.
-- These tables are intentionally service-role-only; PP never receives a database credential.

create table if not exists public.private_property_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  agency_id text not null,
  provider_lead_id text not null,
  message_type text,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'processed', 'duplicate', 'failed', 'ignored')),
  lead_id uuid references public.leads(lead_id) on delete set null,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (organisation_id, provider_lead_id)
);

create index if not exists private_property_webhook_events_status_idx
  on public.private_property_webhook_events (status, received_at desc);

create table if not exists public.private_property_showday_syncs (
  id uuid primary key default gen_random_uuid(),
  marketing_event_id uuid not null references public.marketing_events(id) on delete cascade,
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  environment text not null default 'production' check (environment in ('sandbox', 'production')),
  branch_guid uuid not null,
  property_id text not null,
  active boolean not null,
  source_updated_at timestamptz not null,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (marketing_event_id, environment)
);

create index if not exists private_property_showday_syncs_listing_idx
  on public.private_property_showday_syncs (private_listing_id, environment);

alter table public.private_property_webhook_events enable row level security;
alter table public.private_property_showday_syncs enable row level security;
revoke all on public.private_property_webhook_events from anon, authenticated;
revoke all on public.private_property_showday_syncs from anon, authenticated;
grant all on public.private_property_webhook_events to service_role;
grant all on public.private_property_showday_syncs to service_role;

create or replace function public.private_property_ingest_lead(
  p_organisation_id uuid,
  p_external_reference text,
  p_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_listing_id uuid,
  p_raw_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_lead_id uuid;
  v_contact_id uuid;
  v_lead_id uuid := gen_random_uuid();
  v_first_name text;
  v_last_name text;
begin
  select lead_id into v_existing_lead_id
  from public.lead_ingestion_logs
  where organisation_id = p_organisation_id
    and lower(source) = 'private property'
    and external_reference = nullif(trim(p_external_reference), '')
  limit 1;
  if v_existing_lead_id is not null then return v_existing_lead_id; end if;

  select contact_id into v_contact_id from public.contacts
  where organisation_id = p_organisation_id
    and ((nullif(trim(p_email), '') is not null and lower(email) = lower(trim(p_email)))
      or (nullif(trim(p_phone), '') is not null and phone = trim(p_phone)))
  order by updated_at desc nulls last limit 1;

  v_first_name := coalesce(nullif(split_part(trim(p_name), ' ', 1), ''), 'Lead');
  v_last_name := nullif(trim(regexp_replace(trim(p_name), '^\\S+\\s*', '')), '');
  if v_contact_id is null then
    v_contact_id := gen_random_uuid();
    insert into public.contacts (contact_id, organisation_id, first_name, last_name, phone, email, contact_type, updated_at)
    values (v_contact_id, p_organisation_id, v_first_name, v_last_name, nullif(trim(p_phone), ''), nullif(lower(trim(p_email)), ''), 'Lead', now());
  end if;

  insert into public.leads (lead_id, organisation_id, contact_id, lead_category, lead_direction, lead_source, stage, status, priority, listing_id, enquired_listing_id, source_reference_id, raw_enquiry_payload, notes, updated_at)
  values (v_lead_id, p_organisation_id, v_contact_id, 'buyer', 'Inbound', 'Private Property', 'New Lead', 'New Lead', 'High', p_listing_id, p_listing_id, nullif(trim(p_external_reference), ''), coalesce(p_raw_payload, '{}'::jsonb), nullif(trim(p_message), ''), now());
  insert into public.lead_ingestion_logs (log_id, organisation_id, source, external_reference, payload, status, lead_id, contact_id, listing_id, processed_at)
  values (gen_random_uuid(), p_organisation_id, 'Private Property', nullif(trim(p_external_reference), ''), coalesce(p_raw_payload, '{}'::jsonb), 'processed', v_lead_id, v_contact_id, p_listing_id, now());
  return v_lead_id;
end;
$$;

revoke all on function public.private_property_ingest_lead(uuid, text, text, text, text, text, uuid, jsonb) from public;
grant execute on function public.private_property_ingest_lead(uuid, text, text, text, text, text, uuid, jsonb) to service_role;
